import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  CREW_SESSION_EVENTS_STREAM_PATH, CREW_SESSION_PROMPT_PATH, CREW_WORKBENCH_INBOX_PATH, crewForeignSessionEventsSnapshot, crewForeignSessionEventsStreamHandler, crewForeignSessionPromptHandler, crewForeignSessionsHandler, crewForeignSessionsSnapshot, crewWorkbenchInboxHandler, crewWorkbenchInboxSnapshot,
} from '../src/dashboard/foreign-sessions.ts'

const session = {
  session_id: 'codex/one', adapter_id: 'codex', label: 'One', location: 'workspace-a', status: 'idle', capabilities: ['message'], revision: 2,
  created_at: '2026-08-23T00:00:00Z', updated_at: '2026-08-23T00:01:00Z', adapter_key: 'must-not-leak', target_ref: 'must-not-leak',
}
const event = {
  event_id: 'event-1', session_id: 'codex/one', sequence: 1, cursor: 4, event_type: 'assistant.message',
  payload: { text: 'hello', target_ref: 'must-not-leak', nested: { lease_token: 'must-not-leak', visible: true } }, occurred_at: '2026-08-23T00:00:00Z', recorded_at: '2026-08-23T00:00:01Z',
}

describe('foreign session host projections', () => {
  it('uses bounded explicit browser DTOs and removes private routing facts', async () => {
    const calls: URL[] = []
    const request = async (url: URL): Promise<Response> => {
      calls.push(url)
      return json(url.pathname === '/v1/sessions' ? { sessions: [session] } : { events: [event] })
    }
    const sessions = await crewForeignSessionsSnapshot({ fabricUrl: 'http://127.0.0.1:8787', request, limit: 9_999 })
    const events = await crewForeignSessionEventsSnapshot({ fabricUrl: 'http://127.0.0.1:8787', request, sessionId: 'codex/one', cursor: 2, limit: 9_999 })
    expect(calls[0]?.searchParams.get('limit')).toBe('100')
    expect(calls[1]?.searchParams).toMatchObject({})
    expect(calls[1]?.searchParams.get('session_id')).toBe('codex/one')
    expect(calls[1]?.searchParams.get('cursor')).toBe('2')
    expect(calls[1]?.searchParams.get('limit')).toBe('200')
    expect(JSON.stringify({ sessions, events })).not.toContain('must-not-leak')
    expect(events.events[0]?.payload).toEqual({ text: 'hello', nested: { visible: true } })
  })

  it('rejects malformed source records instead of forwarding a partial projection', async () => {
    await expect(crewForeignSessionsSnapshot({ fabricUrl: 'http://127.0.0.1:8787', request: async () => json({ sessions: [{ ...session, revision: 'two' }] }) })).rejects.toThrow('invalid session response')
  })

  it('joins a bounded workbench mailbox to immutable messages, newest first, without private delivery fields', async () => {
    const calls: URL[] = []
    const request = async (url: URL): Promise<Response> => {
      calls.push(url)
      if (url.pathname === '/v1/mailbox/dsh%2Fworkbench') return json({ deliveries: [
        { delivery_id: 'd1', message_id: 'm1', accepted_sequence: 1, state: 'delivered', claim_owner_adapter_id: 'hidden' },
        { delivery_id: 'd2', message_id: 'm2', accepted_sequence: 2, state: 'delivered', native_attempt_ref: 'hidden' },
      ] })
      if (url.pathname === '/v1/messages/m1') return json({ message_id: 'm1', sender_address: 'crew/codex', body: 'first', created_at: '2026-08-23T00:00:00Z' })
      return json({ message_id: 'm2', sender_address: 'crew/codex', body: 'reply', reply_to_message_id: 'prompt-1', created_at: '2026-08-23T00:01:00Z' })
    }
    const snapshot = await crewWorkbenchInboxSnapshot({ fabricUrl: 'http://127.0.0.1:8787', request, limit: 1 })
    expect(snapshot.messages).toEqual([{ messageId: 'm2', deliveryId: 'd2', state: 'delivered', sender: 'crew/codex', body: 'reply', replyToMessageId: 'prompt-1', createdAt: '2026-08-23T00:01:00Z' }])
    expect(calls.map(call => call.pathname)).toEqual(['/v1/mailbox/dsh%2Fworkbench', '/v1/messages/m2'])
    expect(JSON.stringify(snapshot)).not.toContain('hidden')
  })

  it('serves the browser workbench inbox only over the bounded same-origin GET route', async () => {
    const request = new EventEmitter() as IncomingMessage
    Object.assign(request, { method: 'GET', url: `${CREW_WORKBENCH_INBOX_PATH}?limit=999` })
    const writes: unknown[][] = []; let body = ''
    const response = { writeHead: (...args: unknown[]) => { writes.push(args) }, end: (value?: string) => { body = value ?? '' } }
    await crewWorkbenchInboxHandler({ fabricUrl: 'http://127.0.0.1:8787', request: async url => {
      if (url.pathname.includes('/mailbox/')) return json({ deliveries: [] })
      return json({ message_id: 'unused' })
    } })(request, response as unknown as ServerResponse)
    expect(writes[0]?.[0]).toBe(200); expect(JSON.parse(body)).toEqual({ messages: [] })
  })

  it('answers JSON routes only to GET requests', async () => {
    const writes: unknown[][] = []
    const response = { writeHead: (...args: unknown[]) => { writes.push(args) }, end: () => {} }
    await crewForeignSessionsHandler({ fabricUrl: 'http://127.0.0.1:8787' })({ method: 'POST' } as IncomingMessage, response as unknown as ServerResponse)
    expect(writes).toEqual([[405, { allow: 'GET' }]])
  })

  it('submits a same-origin workbench prompt without exposing the provider lease', async () => {
    const calls: Array<{ readonly sessionId: string; readonly operationId: string; readonly text: string }> = []
    const request = new PassThrough() as PassThrough & IncomingMessage
    Object.assign(request, { method: 'POST', url: CREW_SESSION_PROMPT_PATH })
    request.end(JSON.stringify({ session_id: 'codex/one', operation_id: 'click-1', text: 'review this' }))
    const writes: unknown[][] = []; let body = ''
    const response = { writeHead: (...args: unknown[]) => { writes.push(args) }, end: (value?: string) => { body = value ?? '' } }
    await crewForeignSessionPromptHandler({ adapter: { sendWorkbench: async (sessionId, operationId, text) => { calls.push({ sessionId, operationId, text }); return { messageId: 'm1', replayed: false } } } })(request, response as unknown as ServerResponse)
    expect(calls).toEqual([{ sessionId: 'codex/one', operationId: 'click-1', text: 'review this' }])
    expect(writes).toEqual([[200, expect.objectContaining({ 'content-type': 'application/json; charset=utf-8' })]])
    expect(JSON.parse(body)).toEqual({ messageId: 'm1', replayed: false })
  })

  it('bounds a workbench request before it reaches the provider', async () => {
    let sent = false
    const request = new PassThrough() as PassThrough & IncomingMessage
    Object.assign(request, { method: 'POST', url: CREW_SESSION_PROMPT_PATH })
    request.end(JSON.stringify({ session_id: 'codex/one', operation_id: 'click-1', text: 'x'.repeat(21 * 1024) }))
    const writes: unknown[][] = []; let body = ''
    const response = { writeHead: (...args: unknown[]) => { writes.push(args) }, end: (value?: string) => { body = value ?? '' } }
    await crewForeignSessionPromptHandler({ adapter: { sendWorkbench: async () => { sent = true; return { messageId: 'm1', replayed: false } } } })(request, response as unknown as ServerResponse)
    expect(sent).toBe(false)
    expect(writes[0]?.[0]).toBe(400)
    expect(JSON.parse(body)).toMatchObject({ error: 'Crew prompt request must be 20 KiB or smaller' })
  })

  it('keeps the SSE upstream body streaming, carries Last-Event-ID, and aborts on browser close', async () => {
    let url: URL | undefined; let lastEventId: string | undefined; let aborted = false
    const request = async (input: URL, init?: RequestInit): Promise<Response> => {
      url = input; lastEventId = new Headers(init?.headers).get('last-event-id') ?? undefined
      init?.signal?.addEventListener('abort', () => { aborted = true })
      return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('id: 5\nevent: session_event\ndata: {}\n\n')); controller.close() } }), { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } })
    }
    const incoming = new EventEmitter() as IncomingMessage
    Object.assign(incoming, { method: 'GET', url: `${CREW_SESSION_EVENTS_STREAM_PATH}?session_id=codex%2Fone&cursor=4`, headers: { 'last-event-id': '4' } })
    const response = streamResponse()
    await crewForeignSessionEventsStreamHandler({ fabricUrl: 'http://127.0.0.1:8787', request })(incoming, response as unknown as ServerResponse)
    expect(url?.pathname).toBe('/v1/session-events/stream')
    expect(url?.searchParams.get('session_id')).toBe('codex/one')
    expect(lastEventId).toBe('4')
    expect(response.headers).toContainEqual([200, expect.objectContaining({ 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })])
    expect(response.body).toContain('event: session_event')
    expect(aborted).toBe(true)
  })
})

function json(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }) }
function streamResponse(): PassThrough & { readonly headers: unknown[][]; readonly body: string; writeHead(...args: unknown[]): void } {
  const response = new PassThrough() as PassThrough & { headers: unknown[][]; body: string; writeHead(...args: unknown[]): void }
  const chunks: Buffer[] = []; response.headers = []
  response.on('data', chunk => { chunks.push(Buffer.from(chunk)) })
  response.writeHead = (...args: unknown[]): void => { response.headers.push(args) }
  response.once('finish', () => { queueMicrotask(() => response.emit('close')) })
  Object.defineProperty(response, 'body', { get: () => Buffer.concat(chunks).toString('utf8') })
  return response
}
