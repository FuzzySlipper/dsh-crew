import { describe, expect, it, vi } from 'vitest'
import { CrewMessagingService, type CrewRuntime, type Fabric, type NativeMessage, type RuntimeAgent } from '../src/service.ts'
import type { Binding, Claim, Delivery, Lease, Message } from '../src/protocol.ts'

const binding = (address: string, sessionId: string, generation = 1): Binding => ({ address, bound: true, adapter_id: 'dsh-crew-messaging', target_ref: sessionId, capabilities: ['deliver_when_idle', 'durable_next_turn', 'wake_inactive'], revision: 1, generation })
const envelope = (id: string, recipient = 'beta'): Message => ({ message_id: id, sender_address: 'alpha', recipient_address: recipient, body: `message ${id}` })
const delivery = (id: string, recipient = 'beta'): Delivery => ({ delivery_id: id, message_id: `m-${id}`, recipient_address: recipient, recipient_generation: 1, state: 'claimed', claim_owner_adapter_id: 'dsh-crew-messaging' })

class FakeFabric implements Fabric {
  readonly bindings = [binding('alpha', 's1'), binding('beta', 's2')]
  readonly submitted: Record<string, unknown>[] = []; readonly begun: string[] = []; readonly released: string[] = []; readonly acked: string[] = []; readonly unknowns: string[] = []
  registerCalls = 0; bindWrites = 0; registerFailures = 0
  queue: Claim[] = []; dispatching: Delivery[] = []
  async register(): Promise<Lease> { this.registerCalls += 1; if (this.registerFailures > 0) { this.registerFailures -= 1; throw new Error('fabric unavailable') }; return { adapter_id: 'dsh-crew-messaging', instance_id: 'local', lease_token: 'lease', expires_at: '' } }
  async renew(): Promise<Lease> { return this.register() }
  async listBindings(): Promise<{ addresses: Binding[] }> { return { addresses: this.bindings } }
  async putBinding(address: string, body: Record<string, unknown>): Promise<Binding> {
    this.bindWrites += 1
    const next = { ...binding(address, String(body.target_ref)), revision: 1 }
    const index = this.bindings.findIndex(item => item.address === address)
    if (index === -1) this.bindings.push(next); else this.bindings[index] = next
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
  it('retries a transient initial fabric registration through the ordinary poll loop', async () => {
    vi.useFakeTimers()
    try {
      const fabric = new FakeFabric(); const runtime = new FakeRuntime()
      fabric.registerFailures = 1; fabric.bindings.splice(0)
      const adapter = new CrewMessagingService(fabric, runtime, { bindings: [{ address: 'alpha', sessionId: 's1' }, { address: 'beta', sessionId: 's2' }], pollMs: 10 })
      await expect(adapter.start()).rejects.toThrow('fabric unavailable')
      await vi.advanceTimersByTimeAsync(10)
      expect(fabric.registerCalls).toBe(2); expect(fabric.bindWrites).toBe(2)
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
})
