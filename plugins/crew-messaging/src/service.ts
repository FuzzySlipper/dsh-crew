import { capabilities, nativeAttempt, operation, type Binding, type Claim, type Delivery, type Lease, type Message } from './protocol.ts'

export interface BindingConfig { address: string; sessionId: string }
export interface CrewMessagingConfig {
  url?: string; adapterId?: string; instanceId?: string; bindings?: BindingConfig[]
  leaseDuration?: string; renewMs?: number; pollMs?: number; claimDuration?: string; ttl?: string
}

export interface RuntimeAgent { readonly sessionId: string; readonly status: 'idle' | 'running'; followup(message: NativeMessage): void }
export interface NativeMessage { readonly id: string; readonly source: NativeSource; readonly text: string }
export interface NativeSource { kind: 'crew-messaging'; messageId: string; deliveryId: string; senderAddress: string; recipientAddress: string; form: 'relay' }
export interface CrewRuntime {
  live(sessionId: string): RuntimeAgent | undefined
  resume(sessionId: string): Promise<RuntimeAgent | undefined>
  inspect(sessionId: string): Promise<readonly NativeMessage[] | undefined>
  /** `true` proves the current live session checkpoint completed. */
  flush(agent: RuntimeAgent): Promise<boolean>
  message(delivery: Delivery, envelope: Message): NativeMessage
  onStatus(listener: (agent: RuntimeAgent) => void): () => void
}

/** The fabric operations the pump needs; production uses {@link FabricClient}. */
export interface Fabric {
  register(adapterId: string, instanceId: string, leaseDuration: string): Promise<Lease>
  renew(adapterId: string, leaseToken: string, leaseDuration: string): Promise<Lease>
  listBindings(): Promise<{ addresses: Binding[] }>
  putBinding(address: string, body: Record<string, unknown>): Promise<Binding>
  submit(body: Record<string, unknown>): Promise<{ message: Message; delivery: Delivery; replayed: boolean }>
  claim(body: Record<string, unknown>): Promise<Claim>
  begin(deliveryId: string, body: Record<string, unknown>): Promise<Delivery>
  release(deliveryId: string, body: Record<string, unknown>): Promise<Delivery>
  acknowledge(deliveryId: string, body: Record<string, unknown>): Promise<Delivery>
  unknown(deliveryId: string, body: Record<string, unknown>): Promise<Delivery>
  deliveries(): Promise<{ deliveries: Delivery[] }>
}

const defaults = { adapterId: 'dsh-crew-messaging', instanceId: 'dsh-crew-messaging-local', leaseDuration: '2m', renewMs: 45_000, pollMs: 1_000, claimDuration: '45s', ttl: '24h' }

/** A leased FIFO pump that only delivers an immutable fabric envelope once DSH accepted it. */
export class CrewMessagingService {
  private readonly config: Required<CrewMessagingConfig>
  private readonly tails = new Map<string, Promise<void>>()
  private lease: Lease | undefined
  private leaseRenewedAt = 0
  private initialized = false
  private stopped = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly inFlight = new Set<Promise<void>>()
  private readonly disposeStatus: () => void

  constructor(private readonly fabric: Fabric, private readonly runtime: CrewRuntime, config: CrewMessagingConfig = {}) {
    this.config = { ...defaults, url: config.url ?? 'http://127.0.0.1:8787', bindings: config.bindings ?? [], ...config }
    validateBindings(this.config.bindings)
    this.disposeStatus = runtime.onStatus(agent => { if (agent.status === 'idle') this.observe(this.pumpSession(agent.sessionId)) })
  }

  async start(): Promise<void> {
    try { await this.initialize() } finally { this.schedule() }
  }
  async dispose(): Promise<void> {
    this.stopped = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.disposeStatus()
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight])
  }

  addresses(sessionId: string): string[] { return this.config.bindings.filter(binding => binding.sessionId === sessionId).map(binding => binding.address) }
  async send(sessionId: string, callId: string, recipientAddress: string, text: string, replyToMessageId?: string): Promise<{ messageId: string; replayed: boolean }> {
    const senderAddress = this.addresses(sessionId)[0]
    if (senderAddress === undefined) throw new Error('crew messaging: calling session is not bound')
    const lease = await this.ensureLease()
    const result = await this.fabric.submit({ producer_id: this.config.adapterId, lease_token: lease.lease_token, operation_id: `${sessionId}:${callId}`, sender_address: senderAddress, recipient_address: recipientAddress, body: text, activation_policy: 'wake_when_idle', ttl: this.config.ttl, ...(replyToMessageId === undefined ? {} : { reply_to_message_id: replyToMessageId }) })
    return { messageId: result.message.message_id, replayed: result.replayed }
  }

  private schedule(): void { if (!this.stopped) this.timer = setTimeout(() => { this.timer = undefined; this.observe(this.tick()) }, this.config.pollMs) }
  private async tick(): Promise<void> {
    try {
      if (!this.initialized) { await this.initialize(); return }
      await this.ensureLease()
      await Promise.all(this.config.bindings.map(binding => this.pumpSession(binding.sessionId)))
    } finally { this.schedule() }
  }
  private async initialize(): Promise<void> {
    await this.ensureLease()
    await this.bind()
    await this.reconcile()
    this.initialized = true
  }
  private async ensureLease(): Promise<Lease> {
    if (this.lease === undefined) {
      this.lease = await this.fabric.register(this.config.adapterId, this.config.instanceId, this.config.leaseDuration)
      this.leaseRenewedAt = Date.now()
    } else if (Date.now() - this.leaseRenewedAt >= this.config.renewMs) {
      this.lease = await this.fabric.renew(this.config.adapterId, this.lease.lease_token, this.config.leaseDuration)
      this.leaseRenewedAt = Date.now()
    }
    return this.lease
  }
  private async bind(): Promise<void> {
    const lease = await this.ensureLease(); const existing = await this.fabric.listBindings()
    for (const wanted of this.config.bindings) {
      const current = existing.addresses.find(binding => binding.address === wanted.address)
      if (current?.bound && current.adapter_id === this.config.adapterId && current.target_ref === wanted.sessionId && sameCapabilities(current)) continue
      await this.fabric.putBinding(wanted.address, { actor_adapter_id: this.config.adapterId, lease_token: lease.lease_token, adapter_id: this.config.adapterId, target_ref: wanted.sessionId, capabilities, ...(current === undefined ? {} : { expected_revision: current.revision }) })
    }
  }
  private pumpSession(sessionId: string): Promise<void> {
    const prior = this.tails.get(sessionId) ?? Promise.resolve()
    const tail = prior.catch(() => {}).then(() => this.pumpOnce(sessionId))
    this.tails.set(sessionId, tail)
    return tail.finally(() => { if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId) })
  }
  private async pumpOnce(sessionId: string): Promise<void> {
    const binding = this.config.bindings.find(candidate => candidate.sessionId === sessionId)
    if (binding === undefined || this.stopped) return
    const lease = await this.ensureLease()
    let agent = this.runtime.live(sessionId)
    const availability = agent?.status === 'running' ? 'busy' : agent === undefined ? 'inactive' : 'idle'
    const claimed = await this.fabric.claim({ adapter_id: this.config.adapterId, lease_token: lease.lease_token, operation_id: operation(`${binding.address}:${Date.now()}`, 'claim'), recipient_address: binding.address, recipient_generation: await this.generation(binding.address), availability, claim_duration: this.config.claimDuration })
    if (!claimed.claimed || claimed.delivery === undefined || claimed.message === undefined || claimed.claim_token === undefined) return
    await this.dispatch(claimed, sessionId)
  }
  private async generation(address: string): Promise<number> { const bindings = await this.fabric.listBindings(); const binding = bindings.addresses.find(item => item.address === address); if (binding === undefined) throw new Error(`crew messaging: binding ${address} disappeared`); return binding.generation }
  private async dispatch(claimed: Claim, sessionId: string): Promise<void> {
    const delivery = claimed.delivery!; const envelope = claimed.message!; const attempt = nativeAttempt(delivery.delivery_id); const lease = await this.ensureLease()
    let agent: RuntimeAgent | undefined
    try {
      agent = this.runtime.live(sessionId)
      if (agent === undefined) agent = await this.runtime.resume(sessionId)
    } catch {
      await this.release(delivery.delivery_id, claimed.claim_token!, lease.lease_token)
      return
    }
    if (agent === undefined) {
      await this.release(delivery.delivery_id, claimed.claim_token!, lease.lease_token)
      return
    }
    await this.fabric.begin(delivery.delivery_id, { adapter_id: this.config.adapterId, lease_token: lease.lease_token, operation_id: operation(delivery.delivery_id, 'begin'), claim_token: claimed.claim_token, native_attempt_ref: attempt })
    try {
      agent.followup(this.runtime.message(delivery, envelope))
      if (!await this.runtime.flush(agent) || !await this.accepted(sessionId, delivery.delivery_id)) throw new Error('native acceptance was not durable')
      await this.fabric.acknowledge(delivery.delivery_id, { adapter_id: this.config.adapterId, lease_token: lease.lease_token, operation_id: operation(delivery.delivery_id, 'ack'), native_attempt_ref: attempt })
    } catch {
      await this.fabric.unknown(delivery.delivery_id, { adapter_id: this.config.adapterId, lease_token: lease.lease_token, operation_id: operation(delivery.delivery_id, 'unknown'), native_attempt_ref: attempt })
    }
  }
  private release(deliveryId: string, claimToken: string, leaseToken: string): Promise<Delivery> {
    return this.fabric.release(deliveryId, { adapter_id: this.config.adapterId, lease_token: leaseToken, operation_id: operation(deliveryId, 'release'), claim_token: claimToken })
  }
  private async accepted(sessionId: string, deliveryId: string): Promise<boolean> { return (await this.runtime.inspect(sessionId))?.some(message => message.source.kind === 'crew-messaging' && message.source.deliveryId === deliveryId) ?? false }
  private async reconcile(): Promise<void> {
    const values = await this.fabric.deliveries()
    for (const delivery of values.deliveries.filter(item => item.state === 'dispatching'
      && item.claim_owner_adapter_id === this.config.adapterId
      && item.native_attempt_ref === nativeAttempt(item.delivery_id))) {
      const binding = this.config.bindings.find(item => item.address === delivery.recipient_address)
      if (binding === undefined) continue
      const accepted = await this.accepted(binding.sessionId, delivery.delivery_id)
      const lease = await this.ensureLease(); const body = { adapter_id: this.config.adapterId, lease_token: lease.lease_token, operation_id: operation(delivery.delivery_id, accepted ? 'ack' : 'unknown'), native_attempt_ref: nativeAttempt(delivery.delivery_id) }
      if (!accepted) { await this.fabric.unknown(delivery.delivery_id, body); continue }
      const live = this.runtime.live(binding.sessionId)
      if (live !== undefined && !await this.runtime.flush(live)) { await this.fabric.unknown(delivery.delivery_id, body); continue }
      await this.fabric.acknowledge(delivery.delivery_id, body)
    }
  }
  /** Track background work and contain its rejection at timer/event boundaries. */
  private observe(work: Promise<void>): void {
    const settled = work.catch(() => {}).finally(() => { this.inFlight.delete(settled) })
    this.inFlight.add(settled)
  }
}

function sameCapabilities(binding: Binding): boolean { return binding.capabilities.length === capabilities.length && capabilities.every(value => binding.capabilities.includes(value)) }
function validateBindings(bindings: readonly BindingConfig[]): void {
  const addresses = new Set<string>(); const sessions = new Set<string>()
  for (const binding of bindings) {
    if (addresses.has(binding.address)) throw new Error(`crew messaging: duplicate address "${binding.address}"`)
    if (sessions.has(binding.sessionId)) throw new Error(`crew messaging: duplicate sessionId "${binding.sessionId}"`)
    addresses.add(binding.address); sessions.add(binding.sessionId)
  }
}
