import { describe, expect, it, vi } from 'vitest'
import { CrewMessagingService, type CrewRuntime, type Fabric, type NativeMessage, type RuntimeAgent } from '../src/service.ts'
import type { AddressDiscovery, DiscoveredBinding } from '../src/addressing.ts'
import type { Binding, Claim, Delivery, Lease, Message } from '../src/protocol.ts'

const binding = (address: string, sessionId: string, generation = 1): Binding => ({ address, bound: true, adapter_id: 'dsh-crew-messaging', target_ref: sessionId, capabilities: ['deliver_when_idle', 'durable_next_turn', 'wake_inactive'], revision: 1, generation })
const envelope = (id: string, recipient = 'beta'): Message => ({ message_id: id, sender_address: 'alpha', recipient_address: recipient, body: `message ${id}` })
const delivery = (id: string, recipient = 'beta'): Delivery => ({ delivery_id: id, message_id: `m-${id}`, recipient_address: recipient, recipient_generation: 1, state: 'claimed', claim_owner_adapter_id: 'dsh-crew-messaging' })

class FakeFabric implements Fabric {
  readonly bindings = [binding('alpha', 's1'), binding('beta', 's2')]
  readonly submitted: Record<string, unknown>[] = []; readonly begun: string[] = []; readonly released: string[] = []; readonly unbound: string[] = []; readonly acked: string[] = []; readonly unknowns: string[] = []
  registerCalls = 0; bindWrites = 0; registerFailures = 0
  queue: Claim[] = []; dispatching: Delivery[] = []
  async register(): Promise<Lease> { this.registerCalls += 1; if (this.registerFailures > 0) { this.registerFailures -= 1; throw new Error('fabric unavailable') }; return { adapter_id: 'dsh-crew-messaging', instance_id: 'local', lease_token: 'lease', expires_at: '' } }
  async renew(): Promise<Lease> { return this.register() }
  async listBindings(): Promise<{ addresses: Binding[] }> { return { addresses: this.bindings } }
  async putBinding(address: string, body: Record<string, unknown>): Promise<Binding> {
    this.bindWrites += 1
    const index = this.bindings.findIndex(item => item.address === address)
    const current = index === -1 ? undefined : this.bindings[index]
    const capabilities = Array.isArray(body.capabilities) && body.capabilities.every(value => typeof value === 'string') ? body.capabilities : ['deliver_when_idle', 'durable_next_turn', 'wake_inactive']
    const next = { ...binding(address, String(body.target_ref), (current?.generation ?? 0) + 1), capabilities, revision: (current?.revision ?? 0) + 1 }
    if (index === -1) this.bindings.push(next); else this.bindings[index] = next
    return next
  }
  async unbind(address: string): Promise<Binding> {
    this.unbound.push(address)
    const current = this.bindings.find(item => item.address === address)
    if (current === undefined) throw new Error(`missing ${address}`)
    const next = { ...current, bound: false, revision: current.revision + 1, generation: current.generation + 1 }
    this.bindings[this.bindings.indexOf(current)] = next
    return next
  }
  async submit(body: Record<string, unknown>): Promise<{ message: Message; delivery: Delivery; replayed: boolean }> { this.submitted.push(body); return { message: envelope('out', String(body.recipient_address)), delivery: delivery('out', String(body.recipient_address)), replayed: this.submitted.length > 1 } }
  async claim(): Promise<Claim> { return this.queue.shift() ?? { claimed: false, replayed: false } }
  async begin(deliveryId: string): Promise<Delivery> { this.begun.push(deliveryId); return delivery(deliveryId) }
  async release(deliveryId: string): Promise<Delivery> { this.released.push(deliveryId); return delivery(deliveryId) }
  async acknowledge(deliveryId: string): Promise<Delivery> { this.acked.push(deliveryId); return delivery(deliveryId) }
  async unknown(deliveryId: string): Promise<Delivery> { this.unknowns.push(deliveryId); return delivery(deliveryId) }
  async deliveries(): Promise<{ deliveries: Delivery[] }> { return { deliveries: this.dispatching } }
}

class FakeRuntime implements CrewRuntime {
  readonly agents = new Map<string, RuntimeAgent>(); readonly accepted = new Map<string, NativeMessage[]>(); readonly resumes: string[] = []; readonly events: Array<(agent: RuntimeAgent) => void> = []
  flushResult = true
  resumeAvailable = true
  live(id: string): RuntimeAgent | undefined { return this.agents.get(id) }
  async resume(id: string): Promise<RuntimeAgent | undefined> { this.resumes.push(id); if (!this.resumeAvailable) return undefined; const agent = this.agent(id, 'idle'); this.agents.set(id, agent); return agent }
  async inspect(id: string): Promise<readonly NativeMessage[] | undefined> { return this.accepted.get(id) ?? [] }
  async flush(): Promise<boolean> { return this.flushResult }
  message(d: Delivery, m: Message): NativeMessage { return { id: d.delivery_id, text: m.body, source: { kind: 'crew-messaging', messageId: m.message_id, deliveryId: d.delivery_id, senderAddress: m.sender_address, recipientAddress: m.recipient_address, form: 'relay' } } }
  onStatus(listener: (agent: RuntimeAgent) => void): () => void { this.events.push(listener); return () => { this.events.splice(this.events.indexOf(listener), 1) } }
  agent(id: string, status: 'idle' | 'running'): RuntimeAgent { return { sessionId: id, status, followup: message => { const accepted = this.accepted.get(id) ?? []; accepted.push(message); this.accepted.set(id, accepted) } } }
}

class FakeDiscovery implements AddressDiscovery {
  values: readonly DiscoveredBinding[] = []
  failure: Error | undefined
  readonly listeners = new Set<() => void>()
  async discover(): Promise<readonly DiscoveredBinding[]> {
    if (this.failure !== undefined) throw this.failure
    return this.values
  }
  onChanged(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  change(values: readonly DiscoveredBinding[]): void { this.values = values; for (const listener of this.listeners) listener() }
}

function service(fabric = new FakeFabric(), runtime = new FakeRuntime()): [CrewMessagingService, FakeFabric, FakeRuntime] {
  return [new CrewMessagingService(fabric, runtime, { bindings: [{ address: 'alpha', sessionId: 's1' }, { address: 'beta', sessionId: 's2' }], pollMs: 60_000 }), fabric, runtime]
}

describe('CrewMessagingService', () => {
  it('binds unrelated roots and sends in both directions with stable replay identity', async () => {
    const [adapter, fabric] = service(); await adapter.start()
    await adapter.send('s1', 'call-a', 'beta', 'hello'); await adapter.send('s2', 'call-b', 'alpha', 'reply', 'm-original')
    expect(fabric.submitted.map(body => body.sender_address)).toEqual(['alpha', 'beta'])
    expect(fabric.submitted[1]?.reply_to_message_id).toBe('m-original')
    expect(fabric.submitted[0]?.operation_id).toBe('s1:call-a'); await adapter.dispose()
  })
  it('submits a workbench prompt through its own bound sender only to a capable public session', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime()
    fabric.bindings.push({ address: 'crew/codex', bound: true, adapter_id: 'crew-codex', target_ref: 'public-codex', capabilities: ['queued-prompt-delivery'], revision: 1, generation: 3 })
    const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 })
    await expect(adapter.sendWorkbench('public-codex', 'click-1', 'review this')).resolves.toMatchObject({ messageId: 'out' })
    expect(fabric.submitted.at(-1)).toMatchObject({ operation_id: 'workbench:click-1', sender_address: 'dsh/workbench', recipient_address: 'crew/codex', body: 'review this' })
    await expect(adapter.sendWorkbench('alpha-session', 'click-2', 'nope')).rejects.toThrow('cannot accept workbench prompts')
    await adapter.dispose()
  })
  it('binds the workbench before any prompt with Codex-routable capability and leaves a correct binding alone', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime()
    const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 })
    await adapter.start()
    expect(fabric.bindings.find(item => item.address === 'dsh/workbench')).toMatchObject({ adapter_id: 'dsh-crew-messaging', target_ref: 'dsh-crew-workbench', capabilities: ['deliver_when_idle', 'workbench-inbox'] })
    const writes = fabric.bindWrites
    await (adapter as any).tick()
    expect(fabric.bindWrites).toBe(writes)
    await adapter.dispose()
  })
  it('fails loudly when another adapter owns the workbench address', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime()
    fabric.bindings.push({ address: 'dsh/workbench', bound: true, adapter_id: 'other-adapter', target_ref: 'other', capabilities: ['deliver_when_idle'], revision: 1, generation: 1 })
    const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 })
    await expect(adapter.start()).rejects.toThrow('owned by another adapter')
    await adapter.dispose()
  })
  it('reserves the workbench address case-insensitively from configured and discovered DSH sessions', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); const discovery = new FakeDiscovery()
    expect(() => new CrewMessagingService(fabric, runtime, { workbenchAddress: 'dsh/workbench', bindings: [{ address: 'DSH/WORKBENCH', sessionId: 's1' }] })).toThrow('cannot also bind a DSH session')
    discovery.values = [{ address: 'DSH/WORKBENCH', sessionId: 's1' }, { address: 'reviewer', sessionId: 's2' }]
    const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 }, discovery)
    await adapter.start()
    expect(adapter.addresses('s1')).toEqual([])
    expect(adapter.addresses('s2')).toEqual(['reviewer'])
    expect(fabric.bindings.find(item => item.address.toLowerCase() === 'dsh/workbench')).toMatchObject({ target_ref: 'dsh-crew-workbench' })
    await adapter.dispose()
  })
  it('receipts workbench replies FIFO without resuming or invoking a DSH runtime', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 })
    fabric.queue.push(
      { claimed: true, replayed: false, delivery: delivery('reply-1', 'dsh/workbench'), message: envelope('m-reply-1', 'dsh/workbench'), claim_token: 'claim-1' },
      { claimed: true, replayed: false, delivery: delivery('reply-2', 'dsh/workbench'), message: envelope('m-reply-2', 'dsh/workbench'), claim_token: 'claim-2' },
    )
    await adapter.start(); await (adapter as any).pumpWorkbench(); await (adapter as any).pumpWorkbench()
    expect(fabric.begun).toEqual(['reply-1', 'reply-2']); expect(fabric.acked).toEqual(['reply-1', 'reply-2'])
    expect(runtime.resumes).toEqual([]); expect(runtime.accepted.size).toBe(0)
    await adapter.dispose()
  })
  it('reconciles only the adapter-owned stable workbench receipt attempt on an ordinary tick', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 })
    await adapter.start()
    fabric.dispatching.push(
      { ...delivery('retry', 'dsh/workbench'), state: 'dispatching', native_attempt_ref: 'dsh-crew:retry:workbench' },
      { ...delivery('wrong-attempt', 'dsh/workbench'), state: 'dispatching', native_attempt_ref: 'dsh-crew:wrong-attempt:native' },
      { ...delivery('other-owner', 'dsh/workbench'), state: 'dispatching', claim_owner_adapter_id: 'other-adapter', native_attempt_ref: 'dsh-crew:other-owner:workbench' },
    )
    await (adapter as any).tick()
    expect(fabric.acked).toContain('retry'); expect(fabric.acked).not.toContain('wrong-attempt'); expect(fabric.acked).not.toContain('other-owner')
    await adapter.dispose()
  })
  it('bounds a workbench prompt before fabric submission', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime()
    fabric.bindings.push({ address: 'crew/codex', bound: true, adapter_id: 'crew-codex', target_ref: 'public-codex', capabilities: ['queued-prompt-delivery'], revision: 1, generation: 3 })
    const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 })
    await expect(adapter.sendWorkbench('public-codex', 'click-1', 'x'.repeat(16 * 1024 + 1))).rejects.toThrow('prompt must be 16 KiB or smaller')
    expect(fabric.submitted).toHaveLength(0)
    await adapter.dispose()
  })
  it('retries a transient initial fabric registration through the ordinary poll loop', async () => {
    vi.useFakeTimers()
    try {
      const fabric = new FakeFabric(); const runtime = new FakeRuntime()
      fabric.registerFailures = 1; fabric.bindings.splice(0)
      const adapter = new CrewMessagingService(fabric, runtime, { bindings: [{ address: 'alpha', sessionId: 's1' }, { address: 'beta', sessionId: 's2' }], pollMs: 10 })
      await expect(adapter.start()).rejects.toThrow('fabric unavailable')
      await vi.advanceTimersByTimeAsync(10)
      expect(fabric.registerCalls).toBe(2); expect(fabric.bindWrites).toBe(3)
      fabric.queue.push({ claimed: false, replayed: false }, { claimed: true, replayed: false, delivery: delivery('after-retry'), message: envelope('m-after-retry'), claim_token: 'claim' })
      await vi.advanceTimersByTimeAsync(10)
      expect(runtime.accepted.get('s2')?.[0]?.source.deliveryId).toBe('after-retry')
      await adapter.dispose()
    } finally { vi.useRealTimers() }
  })
  it('uses next-turn followup for a busy target and never invokes a steering surface', async () => {
    const [adapter, fabric, runtime] = service(); runtime.agents.set('s2', runtime.agent('s2', 'running'))
    fabric.queue.push({ claimed: true, replayed: false, delivery: delivery('d1'), message: envelope('m-d1'), claim_token: 'claim' }); await adapter.start(); await (adapter as any).pumpSession('s2')
    expect(runtime.accepted.get('s2')?.[0]?.source.deliveryId).toBe('d1'); expect(fabric.acked).toEqual(['d1']); await adapter.dispose()
  })
  it('waits through the inbox-removal to user-message acceptance gap before acknowledging', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); runtime.agents.set('s2', runtime.agent('s2', 'idle'))
    const inspect = runtime.inspect.bind(runtime); let reads = 0
    runtime.inspect = async id => { reads += 1; return reads < 3 ? [] : await inspect(id) }
    fabric.queue.push({ claimed: true, replayed: false, delivery: delivery('admission-gap'), message: envelope('m-admission-gap'), claim_token: 'claim' })
    const adapter = new CrewMessagingService(fabric, runtime, { bindings: [{ address: 'alpha', sessionId: 's1' }, { address: 'beta', sessionId: 's2' }], pollMs: 60_000, acceptanceTimeoutMs: 100, acceptancePollMs: 1 })
    await adapter.start(); await (adapter as any).pumpSession('s2')
    expect(reads).toBe(3); expect(fabric.acked).toContain('admission-gap'); expect(fabric.unknowns).not.toContain('admission-gap'); await adapter.dispose()
  })
  it('reports outcome_unknown rather than acknowledging when the native flush is false', async () => {
    const [adapter, fabric, runtime] = service(); runtime.agents.set('s2', runtime.agent('s2', 'idle')); runtime.flushResult = false
    fabric.queue.push({ claimed: true, replayed: false, delivery: delivery('unflushed'), message: envelope('m-unflushed'), claim_token: 'claim' })
    await adapter.start(); await (adapter as any).pumpSession('s2')
    expect(fabric.acked).not.toContain('unflushed'); expect(fabric.unknowns).toContain('unflushed'); await adapter.dispose()
  })
  it('releases an unavailable cold root before dispatch without beginning or reporting unknown', async () => {
    const [adapter, fabric, runtime] = service(); runtime.resumeAvailable = false
    fabric.queue.push({ claimed: true, replayed: false, delivery: delivery('unavailable'), message: envelope('m-unavailable'), claim_token: 'claim' })
    await adapter.start(); await (adapter as any).pumpSession('s2')
    expect(fabric.released).toContain('unavailable'); expect(fabric.begun).not.toContain('unavailable'); expect(fabric.unknowns).not.toContain('unavailable'); await adapter.dispose()
  })
  it('resumes the exact inactive root and preserves per-address FIFO pumping', async () => {
    const [adapter, fabric, runtime] = service(); fabric.queue.push({ claimed: true, replayed: false, delivery: delivery('d1'), message: envelope('m1'), claim_token: 'c1' }, { claimed: true, replayed: false, delivery: delivery('d2'), message: envelope('m2'), claim_token: 'c2' })
    await adapter.start(); await (adapter as any).pumpSession('s2'); await (adapter as any).pumpSession('s2')
    expect(runtime.resumes).toEqual(['s2']); expect(runtime.accepted.get('s2')?.map(item => item.source.deliveryId)).toEqual(['d1', 'd2']); await adapter.dispose()
  })
  it('reconciles proven dispatches to acknowledgement and ambiguous ones to outcome_unknown', async () => {
    const [adapter, fabric, runtime] = service(); runtime.accepted.set('s2', [runtime.message(delivery('known'), envelope('m-known'))])
    fabric.dispatching.push({ ...delivery('known'), state: 'dispatching', native_attempt_ref: 'dsh-crew:known:native' }, { ...delivery('unknown'), state: 'dispatching', native_attempt_ref: 'dsh-crew:unknown:native' }, { ...delivery('other'), state: 'dispatching', claim_owner_adapter_id: 'other-adapter', native_attempt_ref: 'dsh-crew:other:native' })
    await adapter.start(); expect(fabric.acked).toContain('known'); expect(fabric.unknowns).toContain('unknown'); expect(fabric.acked).not.toContain('other'); expect(fabric.unknowns).not.toContain('other'); await adapter.dispose()
  })
  it('reaches quiescence by removing lifecycle listeners and awaiting in-flight work', async () => {
    const [adapter, _fabric, runtime] = service(); await adapter.start(); expect(runtime.events).toHaveLength(1); await adapter.dispose(); expect(runtime.events).toHaveLength(0)
  })
  it('rejects duplicate address and duplicate root bindings instead of selecting a first binding', () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime()
    expect(() => new CrewMessagingService(fabric, runtime, { bindings: [{ address: 'alpha', sessionId: 's1' }, { address: 'alpha', sessionId: 's2' }] })).toThrow('duplicate address')
    expect(() => new CrewMessagingService(fabric, runtime, { bindings: [{ address: 'alpha', sessionId: 's1' }, { address: 'beta', sessionId: 's1' }] })).toThrow('duplicate sessionId')
  })
  it('retires a renamed dynamic title after binding its replacement', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); const discovery = new FakeDiscovery()
    discovery.values = [{ address: 'alpha', sessionId: 's1' }]
    const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 }, discovery)
    await adapter.start()
    expect(fabric.bindWrites).toBe(1)
    discovery.change([{ address: 'bravo', sessionId: 's1' }])
    await (adapter as any).addressingTail
    expect(adapter.addresses('s1')).toEqual(['bravo'])
    expect(fabric.bindings.find(item => item.address === 'bravo')?.target_ref).toBe('s1')
    expect(fabric.unbound).toEqual(['alpha'])
    await adapter.dispose()
  })
  it('retains the prior dynamic map when a catalog scan fails', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); const discovery = new FakeDiscovery()
    discovery.values = [{ address: 'alpha', sessionId: 's1' }]
    const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 }, discovery)
    await adapter.start()
    discovery.failure = new Error('persistence unavailable')
    await expect((adapter as any).enqueueAddressing()).rejects.toThrow('persistence unavailable')
    expect(adapter.addresses('s1')).toEqual(['alpha'])
    expect(fabric.unbound).toEqual([])
    await adapter.dispose()
  })
  it('does not retire a dynamic binding whose revision moved outside this adapter', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); const discovery = new FakeDiscovery()
    discovery.values = [{ address: 'alpha', sessionId: 's1' }]
    const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 }, discovery)
    await adapter.start()
    const alpha = fabric.bindings.find(item => item.address === 'alpha')!
    fabric.bindings[fabric.bindings.indexOf(alpha)] = { ...alpha, revision: alpha.revision + 1 }
    discovery.change([{ address: 'bravo', sessionId: 's1' }])
    await (adapter as any).addressingTail
    expect(adapter.addresses('s1')).toEqual(['bravo'])
    expect(fabric.unbound).toEqual([])
    await adapter.dispose()
  })
  it('retires a disappeared dynamic root but retains a configured override', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); const discovery = new FakeDiscovery()
    discovery.values = [{ address: 'alpha', sessionId: 's1' }]
    const adapter = new CrewMessagingService(fabric, runtime, { bindings: [{ address: 'beta', sessionId: 's2' }], pollMs: 60_000 }, discovery)
    await adapter.start()
    discovery.change([])
    await (adapter as any).addressingTail
    expect(adapter.addresses('s1')).toEqual([])
    expect(adapter.addresses('s2')).toEqual(['beta'])
    expect(fabric.unbound).toEqual(['alpha'])
    await adapter.dispose()
  })
  it('skips a foreign dynamic alias while binding other discovered aliases', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); const discovery = new FakeDiscovery()
    fabric.bindings[0] = { ...fabric.bindings[0]!, adapter_id: 'another-adapter', target_ref: 'foreign-root' }
    discovery.values = [{ address: 'alpha', sessionId: 's1' }, { address: 'bravo', sessionId: 's2' }]
    const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 }, discovery)
    await adapter.start()
    expect(adapter.addresses('s1')).toEqual([])
    expect(adapter.addresses('s2')).toEqual(['bravo'])
    expect(fabric.bindings.find(item => item.address === 'alpha')?.adapter_id).toBe('another-adapter')
    expect(fabric.bindings.find(item => item.address === 'bravo')?.target_ref).toBe('s2')
    expect(fabric.bindWrites).toBe(2)
    expect(fabric.unbound).toEqual([])
    expect(adapter.directory()).toEqual([
      { address: 'alpha', status: 'conflict', source: 'session-title' },
      { address: 'bravo', status: 'routable', source: 'session-title' },
    ])
    await adapter.dispose()
  })
  it('publishes ambiguous aliases once, restores them after resolution, and rejects local sends to ambiguity', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); const discovery = new FakeDiscovery()
    discovery.values = [{ address: 'Beta', sessionId: 's2' }, { address: 'beta', sessionId: 's3' }]
    const adapter = new CrewMessagingService(fabric, runtime, { bindings: [{ address: 'alpha', sessionId: 's1' }], pollMs: 60_000 }, discovery)
    await adapter.start()
    expect(adapter.directory()).toEqual([
      { address: 'alpha', status: 'routable', source: 'configured' },
      { address: 'Beta', status: 'ambiguous', source: 'session-title' },
    ])
    await expect(adapter.send('s1', 'ambiguous', 'beta', 'hello')).rejects.toThrow('recipient "Beta" is ambiguous')
    discovery.change([{ address: 'beta', sessionId: 's2' }])
    await (adapter as any).addressingTail
    expect(adapter.addresses('s2')).toEqual(['beta'])
    expect(adapter.directory()).toContainEqual({ address: 'beta', status: 'routable', source: 'session-title' })
    await adapter.dispose()
  })
  it('submits the directory canonical alias after a case-insensitive lookup', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); const discovery = new FakeDiscovery()
    discovery.values = [{ address: 'Beta', sessionId: 's2' }]
    const adapter = new CrewMessagingService(fabric, runtime, { bindings: [{ address: 'alpha', sessionId: 's1' }], pollMs: 60_000 }, discovery)
    await adapter.start()
    await adapter.send('s1', 'canonical-case', 'beta', 'hello')
    expect(fabric.submitted.at(-1)?.recipient_address).toBe('Beta')
    await adapter.dispose()
  })
  it('lists a cold discovered recipient without exposing its session identity', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); const discovery = new FakeDiscovery()
    discovery.values = [{ address: 'cold-reviewer', sessionId: 'cold-session-id' }]
    const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 }, discovery)
    await adapter.start()
    expect(adapter.directory()).toEqual([{ address: 'cold-reviewer', status: 'routable', source: 'session-title' }])
    expect(JSON.stringify(adapter.directory())).not.toContain('cold-session-id')
    expect(adapter.status()).toMatchObject({ initialized: true, stopped: false, connected: true })
    await adapter.dispose()
    expect(adapter.status()).toMatchObject({ initialized: true, stopped: true, connected: false })
  })
  it('notifies directory listeners only after a coherent refresh and clears them on disposal', async () => {
    const fabric = new FakeFabric(); const runtime = new FakeRuntime(); const discovery = new FakeDiscovery()
    discovery.values = [{ address: 'alpha', sessionId: 's1' }]
    const adapter = new CrewMessagingService(fabric, runtime, { pollMs: 60_000 }, discovery)
    let changes = 0
    adapter.onDirectoryChanged(() => { changes += 1; expect(adapter.addresses('s1')).toEqual(['alpha']) })
    await adapter.start()
    expect(changes).toBe(1)
    await adapter.dispose()
    expect((adapter as any).directoryListeners.size).toBe(0)
  })
})
