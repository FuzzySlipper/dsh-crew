import { capabilities, nativeAttempt, operation, type Binding, type Claim, type Delivery, type Lease, type Message } from './protocol.ts'
import { addressKey, effectiveBindings, type AddressDiscovery, type AddressPlan, type DirectoryEntry, type ManagedDynamicBinding } from './addressing.ts'
import { FabricError } from './http.ts'

export type { DirectoryEntry } from './addressing.ts'

export interface BindingConfig { address: string; sessionId: string }
/** Dashboard-safe adapter state; it contains neither a lease token nor a DSH identity. */
export interface CrewMessagingStatus { readonly initialized: boolean; readonly stopped: boolean; readonly connected: boolean; readonly leaseExpiresAt?: string }
export interface CrewMessagingConfig {
  url?: string; adapterId?: string; instanceId?: string; bindings?: BindingConfig[]
  workbenchAddress?: string
  leaseDuration?: string; renewMs?: number; pollMs?: number; claimDuration?: string; ttl?: string
  acceptanceTimeoutMs?: number; acceptancePollMs?: number
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
  unbind(address: string, body: Record<string, unknown>): Promise<Binding>
  submit(body: Record<string, unknown>): Promise<{ message: Message; delivery: Delivery; replayed: boolean }>
  claim(body: Record<string, unknown>): Promise<Claim>
  begin(deliveryId: string, body: Record<string, unknown>): Promise<Delivery>
  release(deliveryId: string, body: Record<string, unknown>): Promise<Delivery>
  acknowledge(deliveryId: string, body: Record<string, unknown>): Promise<Delivery>
  unknown(deliveryId: string, body: Record<string, unknown>): Promise<Delivery>
  deliveries(): Promise<{ deliveries: Delivery[] }>
}

const defaults = { adapterId: 'dsh-crew-messaging', instanceId: 'dsh-crew-messaging-local', workbenchAddress: 'dsh/workbench', leaseDuration: '2m', renewMs: 45_000, pollMs: 1_000, claimDuration: '45s', ttl: '24h', acceptanceTimeoutMs: 1_000, acceptancePollMs: 10 }
const workbenchTarget = 'dsh-crew-workbench'
const workbenchCapabilities = ['prompt-submit']
export const CREW_WORKBENCH_PROMPT_MAX_BYTES = 16 * 1024
export const CREW_WORKBENCH_PROMPT_TOO_LARGE = 'crew messaging: prompt must be 16 KiB or smaller'

/** A leased FIFO pump that only delivers an immutable fabric envelope once DSH accepted it. */
export class CrewMessagingService {
  private readonly config: Required<CrewMessagingConfig>
  private readonly configuredBindings: readonly BindingConfig[]
  private effective: readonly BindingConfig[]
  private directoryEntries: readonly DirectoryEntry[] = []
  private readonly directoryListeners = new Set<() => void>()
  private managedDynamic = new Map<string, ManagedDynamicBinding>()
  private readonly tails = new Map<string, Promise<void>>()
  private lease: Lease | undefined
  private leaseRenewedAt = 0
  private initialized = false
  private stopped = false
  private timer: ReturnType<typeof setTimeout> | undefined
  private readonly inFlight = new Set<Promise<void>>()
  private readonly disposeStatus: () => void
  private disposeDiscovery: (() => void) | undefined
  private addressingTail: Promise<void> = Promise.resolve()

  constructor(private readonly fabric: Fabric, private readonly runtime: CrewRuntime, config: CrewMessagingConfig = {}, private readonly discovery?: AddressDiscovery) {
    this.config = { ...defaults, url: config.url ?? 'http://127.0.0.1:8787', bindings: config.bindings ?? [], ...config }
    validateBindings(this.config.bindings)
    if (this.config.workbenchAddress.trim() === '') throw new Error('crew messaging: workbenchAddress is required')
    if (this.config.bindings.some(binding => binding.address === this.config.workbenchAddress)) throw new Error(`crew messaging: workbenchAddress "${this.config.workbenchAddress}" cannot also bind a DSH session`)
    this.configuredBindings = this.config.bindings
    this.effective = []
    this.disposeStatus = runtime.onStatus(agent => { if (agent.status === 'idle') this.observe(this.pumpAfterAddressing(agent.sessionId)) })
  }

  async start(): Promise<void> {
    this.disposeDiscovery = this.discovery?.onChanged(() => this.observe(this.enqueueAddressing()))
    try { await this.initialize() } finally { this.schedule() }
  }
  async dispose(): Promise<void> {
    this.stopped = true
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.disposeDiscovery?.()
    this.disposeStatus()
    while (this.inFlight.size > 0) await Promise.all([...this.inFlight])
    this.directoryListeners.clear()
  }

  addresses(sessionId: string): string[] { return this.effective.filter(binding => binding.sessionId === sessionId).map(binding => binding.address) }
  directory(): readonly DirectoryEntry[] { return this.directoryEntries }
  status(): CrewMessagingStatus {
    return {
      initialized: this.initialized,
      stopped: this.stopped,
      connected: !this.stopped && this.lease !== undefined,
      ...(this.lease?.expires_at === undefined || this.lease.expires_at.length === 0 ? {} : { leaseExpiresAt: this.lease.expires_at }),
    }
  }
  onDirectoryChanged(listener: () => void): () => void { this.directoryListeners.add(listener); return () => { this.directoryListeners.delete(listener) } }
  async send(sessionId: string, callId: string, recipientAddress: string, text: string, replyToMessageId?: string): Promise<{ messageId: string; replayed: boolean }> {
    const senderAddress = this.addresses(sessionId)[0]
    if (senderAddress === undefined) throw new Error('crew messaging: calling session is not bound')
    const recipient = this.directoryEntries.find(entry => entry.address === recipientAddress)
      ?? this.directoryEntries.find(entry => addressKey(entry.address) === addressKey(recipientAddress))
    if (recipient === undefined) throw new Error(`crew messaging: unknown recipient "${recipientAddress}"`)
    if (recipient.status !== 'routable') throw new Error(`crew messaging: recipient "${recipient.address}" is ${recipient.status}`)
    const lease = await this.ensureLease()
    const result = await this.fabric.submit({ producer_id: this.config.adapterId, lease_token: lease.lease_token, operation_id: `${sessionId}:${callId}`, sender_address: senderAddress, recipient_address: recipient.address, body: text, activation_policy: 'wake_when_idle', ttl: this.config.ttl, ...(replyToMessageId === undefined ? {} : { reply_to_message_id: replyToMessageId }) })
    return { messageId: result.message.message_id, replayed: result.replayed }
  }
  /** Submit one human workbench prompt to a public adapter session without exposing the lease to the browser. */
  async sendWorkbench(sessionId: string, operationId: string, text: string): Promise<{ messageId: string; replayed: boolean }> {
    if (sessionId.trim() === '') throw new Error('crew messaging: target session is required')
    if (operationId.trim() === '') throw new Error('crew messaging: operation is required')
    if (text.trim() === '') throw new Error('crew messaging: prompt is required')
    if (Buffer.byteLength(text, 'utf8') > CREW_WORKBENCH_PROMPT_MAX_BYTES) throw new Error(CREW_WORKBENCH_PROMPT_TOO_LARGE)
    const lease = await this.ensureLease()
    const bindings = await this.fabric.listBindings()
    await this.ensureWorkbenchBinding(lease, bindings.addresses)
    const recipients = bindings.addresses.filter(binding => binding.bound && binding.target_ref === sessionId && binding.capabilities.includes('queued-prompt-delivery'))
    if (recipients.length !== 1) throw new Error('crew messaging: target session cannot accept workbench prompts')
    const recipient = recipients[0]!
    const result = await this.fabric.submit({
      producer_id: this.config.adapterId, lease_token: lease.lease_token, operation_id: `workbench:${operationId}`,
      sender_address: this.config.workbenchAddress, recipient_address: recipient.address, body: text,
      activation_policy: 'wake_when_idle', ttl: this.config.ttl,
    })
    return { messageId: result.message.message_id, replayed: result.replayed }
  }

  private schedule(): void { if (!this.stopped) this.timer = setTimeout(() => { this.timer = undefined; this.observe(this.tick()) }, this.config.pollMs) }
  private async tick(): Promise<void> {
    try {
      if (!this.initialized) { await this.initialize(); return }
      await this.ensureLease()
      await this.enqueueAddressing()
      await Promise.all(this.effective.map(binding => this.pumpSession(binding.sessionId)))
    } finally { this.schedule() }
  }
  private async initialize(): Promise<void> {
    await this.ensureLease()
    await this.enqueueAddressing()
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
  private pumpAfterAddressing(sessionId: string): Promise<void> {
    return this.addressingTail.catch(() => {}).then(() => this.pumpSession(sessionId))
  }
  private enqueueAddressing(): Promise<void> {
    const tail = this.addressingTail.catch(() => {}).then(() => this.refreshAddressing())
    this.addressingTail = tail
    return tail
  }
  private async refreshAddressing(): Promise<void> {
    if (this.stopped) return
    const discovered = this.discovery === undefined ? [] : await this.discovery.discover()
    const desired = effectiveBindings(this.configuredBindings, discovered)
    await this.bind(desired)
  }
  private async ensureWorkbenchBinding(lease: Lease, bindings: readonly Binding[]): Promise<void> {
    const current = bindings.find(binding => binding.address === this.config.workbenchAddress)
    if (current?.bound && current.adapter_id === this.config.adapterId && current.target_ref === workbenchTarget && current.capabilities.length === workbenchCapabilities.length && workbenchCapabilities.every(capability => current.capabilities.includes(capability))) return
    if (current?.bound && current.adapter_id !== this.config.adapterId) throw new Error(`crew messaging: workbench address "${this.config.workbenchAddress}" is owned by another adapter`)
    await this.fabric.putBinding(this.config.workbenchAddress, {
      actor_adapter_id: this.config.adapterId, lease_token: lease.lease_token, adapter_id: this.config.adapterId, target_ref: workbenchTarget,
      capabilities: workbenchCapabilities, ...(current === undefined ? {} : { expected_revision: current.revision }),
    })
  }
  private async bind(plan: AddressPlan): Promise<void> {
    const { all: wanted, dynamic } = plan
    const lease = await this.ensureLease(); const existing = await this.fabric.listBindings()
    const currentByAddress = new Map(existing.addresses.map(binding => [binding.address, binding]))
    const nextManaged = new Map<string, ManagedDynamicBinding>()
    const dynamicByAddress = new Map(dynamic.map(binding => [binding.address, binding]))
    const conflicts = new Set<string>()
    const active: BindingConfig[] = []
    for (const binding of wanted) {
      const current = currentByAddress.get(binding.address)
      const isDynamic = dynamicByAddress.has(binding.address)
      if (isDynamic && current?.bound && current.adapter_id !== this.config.adapterId) {
        conflicts.add(binding.address)
        continue
      }
      if (current?.bound && current.adapter_id === this.config.adapterId && current.target_ref === binding.sessionId && sameCapabilities(current)) {
        active.push(binding)
        if (isDynamic) {
          nextManaged.set(binding.address, { ...binding, revision: current.revision })
        }
        continue
      }
      let written: Binding
      try {
        written = await this.fabric.putBinding(binding.address, { actor_adapter_id: this.config.adapterId, lease_token: lease.lease_token, adapter_id: this.config.adapterId, target_ref: binding.sessionId, capabilities, ...(current === undefined ? {} : { expected_revision: current.revision }) })
      } catch (error: unknown) {
        if (isDynamic && error instanceof FabricError && error.code === 'adapter_mismatch') {
          conflicts.add(binding.address)
          continue
        }
        throw error
      }
      currentByAddress.set(binding.address, written)
      active.push(binding)
      if (isDynamic) nextManaged.set(binding.address, { ...binding, revision: written.revision })
    }
    for (const [address, prior] of this.managedDynamic) {
      if (nextManaged.has(address)) continue
      const current = currentByAddress.get(address)
      if (current === undefined || !current.bound || current.adapter_id !== this.config.adapterId || current.target_ref !== prior.sessionId || current.revision !== prior.revision) continue
      await this.fabric.unbind(address, { actor_adapter_id: this.config.adapterId, lease_token: lease.lease_token, expected_revision: current.revision })
    }
    this.effective = active
    this.managedDynamic = nextManaged
    this.publishDirectory(plan.directory.map(entry => conflicts.has(entry.address) ? { ...entry, status: 'conflict' } : entry))
  }
  private publishDirectory(entries: readonly DirectoryEntry[]): void {
    if (sameDirectory(this.directoryEntries, entries)) return
    this.directoryEntries = entries
    for (const listener of this.directoryListeners) listener()
  }
  private pumpSession(sessionId: string): Promise<void> {
    const prior = this.tails.get(sessionId) ?? Promise.resolve()
    const tail = prior.catch(() => {}).then(() => this.pumpOnce(sessionId))
    this.tails.set(sessionId, tail)
    return tail.finally(() => { if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId) })
  }
  private async pumpOnce(sessionId: string): Promise<void> {
    const binding = this.effective.find(candidate => candidate.sessionId === sessionId)
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
      if (!await this.runtime.flush(agent) || !await this.accepted(sessionId, delivery.delivery_id, this.config.acceptanceTimeoutMs)) throw new Error('native acceptance was not durable')
      await this.fabric.acknowledge(delivery.delivery_id, { adapter_id: this.config.adapterId, lease_token: lease.lease_token, operation_id: operation(delivery.delivery_id, 'ack'), native_attempt_ref: attempt })
    } catch {
      await this.fabric.unknown(delivery.delivery_id, { adapter_id: this.config.adapterId, lease_token: lease.lease_token, operation_id: operation(delivery.delivery_id, 'unknown'), native_attempt_ref: attempt })
    }
  }
  private release(deliveryId: string, claimToken: string, leaseToken: string): Promise<Delivery> {
    return this.fabric.release(deliveryId, { adapter_id: this.config.adapterId, lease_token: leaseToken, operation_id: operation(deliveryId, 'release'), claim_token: claimToken })
  }
  private async accepted(sessionId: string, deliveryId: string, waitMs = 0): Promise<boolean> {
    const deadline = Date.now() + waitMs
    while (true) {
      if ((await this.runtime.inspect(sessionId))?.some(message => message.source.kind === 'crew-messaging' && message.source.deliveryId === deliveryId) ?? false) return true
      const remaining = deadline - Date.now()
      if (remaining <= 0) return false
      await new Promise(resolve => setTimeout(resolve, Math.min(this.config.acceptancePollMs, remaining)))
    }
  }
  private async reconcile(): Promise<void> {
    const values = await this.fabric.deliveries()
    for (const delivery of values.deliveries.filter(item => item.state === 'dispatching'
      && item.claim_owner_adapter_id === this.config.adapterId
      && item.native_attempt_ref === nativeAttempt(item.delivery_id))) {
      const binding = this.effective.find(item => item.address === delivery.recipient_address)
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
function sameDirectory(left: readonly DirectoryEntry[], right: readonly DirectoryEntry[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry.address === right[index]?.address && entry.status === right[index]?.status && entry.source === right[index]?.source)
}
function validateBindings(bindings: readonly BindingConfig[]): void {
  const addresses = new Set<string>(); const sessions = new Set<string>()
  for (const binding of bindings) {
    if (addresses.has(binding.address)) throw new Error(`crew messaging: duplicate address "${binding.address}"`)
    if (sessions.has(binding.sessionId)) throw new Error(`crew messaging: duplicate sessionId "${binding.sessionId}"`)
    addresses.add(binding.address); sessions.add(binding.sessionId)
  }
}
