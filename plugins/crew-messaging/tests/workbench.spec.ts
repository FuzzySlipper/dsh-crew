import { describe, expect, it } from 'vitest'
import type { CrewForeignSession, CrewForeignSessionEvent } from '../src/dashboard/types.ts'
import { CrewSessionWorkbenchController, decodeCrewForeignSessionEvent, type CrewEventSource } from '../src/client/CrewSessionWorkbench.ts'

const session: CrewForeignSession = { sessionId: 'codex/one', adapterId: 'codex', label: 'One', status: 'idle', capabilities: [], revision: 1, createdAt: 'now', updatedAt: 'now' }
const event = (cursor: number): CrewForeignSessionEvent => ({ eventId: `event-${String(cursor)}`, sessionId: 'codex/one', sequence: cursor, cursor, eventType: 'assistant.message', payload: { cursor }, occurredAt: 'now', recordedAt: 'now' })

describe('foreign session workbench controller', () => {
  it('loads bounded history, follows named events, and dedupes replay cursors', async () => {
    const sources: FakeEventSource[] = []
    const controller = new CrewSessionWorkbenchController({
      listSessions: async () => ({ sessions: [session] }), listEvents: async () => ({ events: [event(2), event(4)] }),
      stream: () => { const source = new FakeEventSource(); sources.push(source); return source },
    })
    await controller.open()
    sources[0]!.emit('open')
    sources[0]!.emit('session_event', JSON.stringify(event(4)))
    sources[0]!.emit('session_event', JSON.stringify(event(5)))
    expect(controller.getSnapshot()).toMatchObject({ open: true, selectedSessionId: 'codex/one', cursor: 5, connection: 'open' })
    expect(controller.getSnapshot().events.map(value => value.cursor)).toEqual([2, 4, 5])
  })

  it('closes the old stream and aborts history work when selection changes or unloads', async () => {
    let aborts = 0; const sources: FakeEventSource[] = []
    const second = { ...session, sessionId: 'codex/two', label: 'Two' }
    const controller = new CrewSessionWorkbenchController({
      listSessions: async () => ({ sessions: [session, second] }),
      listEvents: async (_id, _cursor, signal) => { signal.addEventListener('abort', () => { aborts += 1 }); return { events: [] } },
      stream: () => { const source = new FakeEventSource(); sources.push(source); return source },
    })
    await controller.open(); await controller.select('codex/two'); controller.dispose()
    expect(sources[0]?.closed).toBe(true)
    expect(sources[1]?.closed).toBe(true)
    expect(aborts).toBeGreaterThanOrEqual(2)
  })

  it.each(['close', 'dispose'] as const)('does not resurrect a selection after a delayed list resolves during %s', async action => {
    let resolveList: ((value: { readonly sessions: readonly CrewForeignSession[] }) => void) | undefined
    let historyCalls = 0; let streamCalls = 0
    const controller = new CrewSessionWorkbenchController({
      listSessions: async () => await new Promise(resolve => { resolveList = resolve }),
      listEvents: async () => { historyCalls += 1; return { events: [] } },
      stream: () => { streamCalls += 1; return new FakeEventSource() },
    })
    const opening = controller.open()
    controller[action]()
    resolveList!({ sessions: [session] })
    await opening
    expect(controller.getSnapshot()).toMatchObject({ open: false, selectedSessionId: undefined, connection: 'closed' })
    expect(historyCalls).toBe(0)
    expect(streamCalls).toBe(0)
  })

  it('rebinds history and EventSource after open, close, and open again', async () => {
    const sources: FakeEventSource[] = []; let histories = 0
    const controller = new CrewSessionWorkbenchController({
      listSessions: async () => ({ sessions: [session] }),
      listEvents: async () => { histories += 1; return { events: [event(histories)] } },
      stream: () => { const source = new FakeEventSource(); sources.push(source); return source },
    })
    await controller.open(); controller.close(); await controller.open()
    expect(histories).toBe(2)
    expect(sources).toHaveLength(2)
    expect(sources[0]?.closed).toBe(true)
    expect(controller.getSnapshot()).toMatchObject({ open: true, selectedSessionId: 'codex/one', cursor: 2, connection: 'connecting' })
  })

  it('does not reopen work after permanent disposal', async () => {
    let listCalls = 0
    const controller = new CrewSessionWorkbenchController({
      listSessions: async () => { listCalls += 1; return { sessions: [session] } },
      listEvents: async () => ({ events: [] }), stream: () => new FakeEventSource(),
    })
    controller.dispose(); await controller.open(); await controller.refresh(); await controller.select('codex/one')
    expect(listCalls).toBe(0)
    expect(controller.getSnapshot()).toMatchObject({ open: false, selectedSessionId: undefined, connection: 'closed' })
  })

  it('does not parse malformed stream data into a timeline fact', () => {
    expect(decodeCrewForeignSessionEvent('{not-json')).toBeUndefined()
    expect(decodeCrewForeignSessionEvent({ eventId: 'missing' })).toBeUndefined()
  })

  it('normalizes raw upstream SSE fields without exposing private routing data', () => {
    expect(decodeCrewForeignSessionEvent(JSON.stringify({
      event_id: 'event-7', session_id: 'codex/one', sequence: 7, cursor: 7, event_type: 'assistant.message',
      payload: { text: 'hello', target_ref: 'hidden' }, occurred_at: 'now', recorded_at: 'now',
    }))).toMatchObject({ eventId: 'event-7', eventType: 'assistant.message', payload: { text: 'hello' } })
  })
})

class FakeEventSource implements CrewEventSource {
  public closed = false
  private readonly listeners = new Map<string, EventListener[]>()
  addEventListener(type: 'open' | 'error' | 'session_event', listener: EventListener): void { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]) }
  close(): void { this.closed = true }
  emit(type: 'open' | 'error' | 'session_event', data?: string): void { for (const listener of this.listeners.get(type) ?? []) listener(type === 'session_event' ? new MessageEvent(type, { data }) : new Event(type)) }
}
