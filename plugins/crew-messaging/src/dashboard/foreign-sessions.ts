/** Same-origin read-only projections and stream proxy for foreign Crew sessions. */

import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CrewForeignSession, CrewForeignSessionEvent, CrewForeignSessionEventsSnapshot, CrewForeignSessionsSnapshot } from './types.ts'

/** Same-origin browser endpoints; the browser never reaches the loopback fabric directly. */
export const CREW_SESSIONS_PATH = '/plugins/dsh-crew-messaging/sessions'
export const CREW_SESSION_EVENTS_PATH = '/plugins/dsh-crew-messaging/session-events'
export const CREW_SESSION_EVENTS_STREAM_PATH = '/plugins/dsh-crew-messaging/session-events/stream'
export const CREW_SESSION_PROMPT_PATH = '/plugins/dsh-crew-messaging/session-prompt'

/** Keep the shell workbench responsive even when an adapter has a long event history. */
export const CREW_SESSION_LIST_LIMIT = 100
export const CREW_SESSION_EVENT_LIMIT = 200
export const CREW_SESSION_PROMPT_REQUEST_MAX_BYTES = 20 * 1024
export const CREW_SESSION_PROMPT_TOO_LARGE = 'Crew prompt request must be 20 KiB or smaller'

/** Testable local-fabric fetch surface. */
export type ForeignSessionFetch = (input: URL, init?: RequestInit) => Promise<Response>

/** Same-process authority for one browser workbench submission. */
export interface CrewWorkbenchPromptAdapter {
  sendWorkbench(sessionId: string, operationId: string, text: string): Promise<{ readonly messageId: string; readonly replayed: boolean }>
}

/** Build explicit browser fields from the service's public session response. */
export async function crewForeignSessionsSnapshot(input: {
  readonly fabricUrl: string
  readonly request?: ForeignSessionFetch
  readonly limit?: number
}): Promise<CrewForeignSessionsSnapshot> {
  const response = await requestJson(input, '/v1/sessions', { limit: boundedLimit(input.limit, CREW_SESSION_LIST_LIMIT) })
  const value = object(await response.json())
  const sessions = Array.isArray(value?.sessions) ? value.sessions.map(projectSession) : undefined
  if (sessions === undefined || sessions.some(session => session === undefined)) throw new Error('invalid session response')
  return { sessions: sessions as readonly CrewForeignSession[] }
}

/** Build an explicit bounded timeline response for one public foreign session identity. */
export async function crewForeignSessionEventsSnapshot(input: {
  readonly fabricUrl: string
  readonly sessionId: string
  readonly cursor?: number
  readonly limit?: number
  readonly request?: ForeignSessionFetch
}): Promise<CrewForeignSessionEventsSnapshot> {
  if (input.sessionId.trim() === '') throw new Error('session_id is required')
  const response = await requestJson(input, '/v1/session-events', {
    session_id: input.sessionId,
    cursor: boundedCursor(input.cursor),
    limit: boundedLimit(input.limit, CREW_SESSION_EVENT_LIMIT),
  })
  const value = object(await response.json())
  const events = Array.isArray(value?.events) ? value.events.map(projectEvent) : undefined
  if (events === undefined || events.some(event => event === undefined)) throw new Error('invalid session event response')
  return { events: events as readonly CrewForeignSessionEvent[] }
}

/** Own the same-origin JSON response lifecycle for a bounded foreign session list. */
export function crewForeignSessionsHandler(input: { readonly fabricUrl: string; readonly request?: ForeignSessionFetch }): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    if (request.method !== 'GET') return methodNotAllowed(response)
    try {
      const limit = requestLimit(request, CREW_SESSION_LIST_LIMIT)
      respondJson(response, 200, await crewForeignSessionsSnapshot({ fabricUrl: input.fabricUrl, limit, ...(input.request === undefined ? {} : { request: input.request }) }))
    } catch (error) {
      respondJson(response, 503, { error: error instanceof Error ? error.message : 'Crew session service is unavailable' })
    }
  }
}

/** Own the same-origin JSON response lifecycle for one bounded foreign event history. */
export function crewForeignSessionEventsHandler(input: { readonly fabricUrl: string; readonly request?: ForeignSessionFetch }): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    if (request.method !== 'GET') return methodNotAllowed(response)
    let sessionId: string; let cursor: number; let limit: number
    try {
      sessionId = requiredQuery(request, 'session_id')
      cursor = requestCursor(request)
      limit = requestLimit(request, CREW_SESSION_EVENT_LIMIT)
    } catch (error) {
      respondJson(response, 400, { error: error instanceof Error ? error.message : 'invalid request' })
      return
    }
    try {
      respondJson(response, 200, await crewForeignSessionEventsSnapshot({ fabricUrl: input.fabricUrl, sessionId, cursor, limit, ...(input.request === undefined ? {} : { request: input.request }) }))
    } catch (error) {
      respondJson(response, 503, { error: error instanceof Error ? error.message : 'Crew session service is unavailable' })
    }
  }
}

/** Keep browser prompts same-origin while the provider retains its fabric lease. */
export function crewForeignSessionPromptHandler(input: { readonly adapter: CrewWorkbenchPromptAdapter }): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    if (request.method !== 'POST') return methodNotAllowed(response, 'POST')
    try {
      const body = object(JSON.parse(await requestText(request, CREW_SESSION_PROMPT_REQUEST_MAX_BYTES)))
      const sessionId = text(body?.session_id); const operationId = text(body?.operation_id); const prompt = text(body?.text)
      if (sessionId === undefined || operationId === undefined || prompt === undefined) throw new Error('session_id, operation_id, and text are required')
      const submitted = await input.adapter.sendWorkbench(sessionId, operationId, prompt)
      respondJson(response, 200, { messageId: submitted.messageId, replayed: submitted.replayed })
    } catch (error) {
      respondJson(response, 400, { error: error instanceof Error ? error.message : 'Crew prompt submission failed' })
    }
  }
}

/**
 * Proxy the fabric SSE body without buffering it, so EventSource reconnects stay same-origin.
 *
 * @returns An async handler that aborts the upstream request when the browser disconnects.
 */
export function crewForeignSessionEventsStreamHandler(input: { readonly fabricUrl: string; readonly request?: ForeignSessionFetch }): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    if (request.method !== 'GET') return methodNotAllowed(response)
    let sessionId: string; let cursor: number; let limit: number
    try { sessionId = requiredQuery(request, 'session_id'); cursor = requestCursor(request); limit = requestLimit(request, CREW_SESSION_EVENT_LIMIT) } catch (error) { respondJson(response, 400, { error: error instanceof Error ? error.message : 'invalid request' }); return }
    const controller = new AbortController()
    const abort = (): void => { controller.abort() }
    response.once('close', abort)
    try {
      const upstream = await (input.request ?? fetch)(upstreamUrl(input.fabricUrl, '/v1/session-events/stream', {
        session_id: sessionId, cursor, limit,
      }), {
        headers: {
          accept: 'text/event-stream',
          ...(request.headers['last-event-id'] === undefined ? {} : { 'last-event-id': String(request.headers['last-event-id']) }),
        },
        signal: controller.signal,
      })
      if (!upstream.ok || upstream.body === null) {
        response.writeHead(upstream.status || 503, { 'content-type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        response.end(upstream.body === null ? '' : await upstream.text())
        return
      }
      response.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') ?? 'text/event-stream',
        'cache-control': upstream.headers.get('cache-control') ?? 'no-cache',
        connection: 'keep-alive',
      })
      const body = Readable.fromWeb(upstream.body as import('node:stream/web').ReadableStream)
      body.on('error', () => { if (!response.destroyed) response.destroy() })
      body.pipe(response)
      await new Promise<void>(resolve => response.once('close', resolve))
    } catch {
      if (!response.headersSent) respondJson(response, 503, { error: 'Crew session stream is unavailable' })
      else if (!response.destroyed) response.destroy()
    } finally {
      response.off('close', abort)
      controller.abort()
    }
  }
}

async function requestJson(input: { readonly fabricUrl: string; readonly request?: ForeignSessionFetch }, path: string, query: Record<string, string | number>): Promise<Response> {
  const response = await (input.request ?? fetch)(upstreamUrl(input.fabricUrl, path, query), {
    headers: { accept: 'application/json' }, signal: AbortSignal.timeout(1_500),
  })
  if (!response.ok) throw new Error(`fabric response ${String(response.status)}`)
  return response
}

function upstreamUrl(fabricUrl: string, path: string, query: Record<string, string | number>): URL {
  const url = new URL(path, fabricUrl)
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value))
  return url
}
function methodNotAllowed(response: ServerResponse, allow = 'GET'): void { response.writeHead(405, { allow }); response.end() }
async function requestText(request: IncomingMessage, maxBytes = CREW_SESSION_PROMPT_REQUEST_MAX_BYTES): Promise<string> {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += value.length
    if (bytes > maxBytes) throw new Error(CREW_SESSION_PROMPT_TOO_LARGE)
    chunks.push(value)
  }
  return Buffer.concat(chunks).toString('utf8')
}
function respondJson(response: ServerResponse, status: number, value: unknown): void { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)) }
function requiredQuery(request: IncomingMessage, name: string): string { const value = new URL(request.url ?? '/', 'http://localhost').searchParams.get(name)?.trim(); if (value === undefined || value === '') throw new Error(`${name} is required`); return value }
function requestLimit(request: IncomingMessage, fallback: number): number { const value = new URL(request.url ?? '/', 'http://localhost').searchParams.get('limit'); if (value === null) return fallback; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('limit must be positive'); return Math.min(parsed, fallback) }
function requestCursor(request: IncomingMessage): number { const value = new URL(request.url ?? '/', 'http://localhost').searchParams.get('cursor'); if (value === null) return 0; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error('cursor must be non-negative'); return parsed }
function boundedLimit(value: number | undefined, fallback: number): number { return Number.isSafeInteger(value) && value! > 0 ? Math.min(value!, fallback) : fallback }
function boundedCursor(value: number | undefined): number { return Number.isSafeInteger(value) && value! >= 0 ? value! : 0 }

function projectSession(value: unknown): CrewForeignSession | undefined {
  const record = object(value)
  const sessionId = text(record?.session_id); const adapterId = text(record?.adapter_id); const label = text(record?.label); const status = text(record?.status)
  const revision = integer(record?.revision); const createdAt = text(record?.created_at); const updatedAt = text(record?.updated_at)
  const capabilities = Array.isArray(record?.capabilities) && record.capabilities.every(item => typeof item === 'string') ? record.capabilities as readonly string[] : undefined
  const location = text(record?.location)
  if (sessionId === undefined || adapterId === undefined || label === undefined || status === undefined || revision === undefined || createdAt === undefined || updatedAt === undefined || capabilities === undefined) return undefined
  return { sessionId, adapterId, label, status, capabilities, revision, createdAt, updatedAt, ...(location === undefined ? {} : { location }) }
}
function projectEvent(value: unknown): CrewForeignSessionEvent | undefined {
  const record = object(value)
  const eventId = text(record?.event_id); const sessionId = text(record?.session_id); const sequence = integer(record?.sequence); const cursor = integer(record?.cursor)
  const eventType = text(record?.event_type); const occurredAt = text(record?.occurred_at); const recordedAt = text(record?.recorded_at)
  if (eventId === undefined || sessionId === undefined || sequence === undefined || cursor === undefined || eventType === undefined || occurredAt === undefined || recordedAt === undefined || !('payload' in (record ?? {}))) return undefined
  const payload = safePayload(record!.payload)
  if (payload === undefined) return undefined
  return { eventId, sessionId, sequence, cursor, eventType, payload, occurredAt, recordedAt }
}
/** Preserve generic event inspection while excluding the service's private routing credentials. */
function safePayload(value: unknown): unknown | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (Array.isArray(value)) { const items = value.map(safePayload); return items.some(item => item === undefined) ? undefined : items }
  const record = object(value)
  if (record === undefined) return undefined
  const projected: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(record)) {
    if (key === 'adapter_key' || key === 'target_ref' || key === 'lease_token' || key.endsWith('_token')) continue
    const nested = safePayload(entry); if (nested === undefined) return undefined
    projected[key] = nested
  }
  return projected
}
function object(value: unknown): Record<string, unknown> | undefined { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function text(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined }
function integer(value: unknown): number | undefined { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined }
