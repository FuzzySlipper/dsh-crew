import type { IncomingMessage, ServerResponse } from 'node:http'

export const CREW_CODEX_CREATE_PATH = '/plugins/dsh-crew-messaging/codex/create'
export const CREW_CODEX_INTERRUPT_PATH = '/plugins/dsh-crew-messaging/codex/interrupt'
export const CREW_CODEX_INTERACTIONS_PATH = '/plugins/dsh-crew-messaging/codex/interactions'
export const CREW_CODEX_RESPOND_PATH = '/plugins/dsh-crew-messaging/codex/respond'
export const CREW_CODEX_CAPABILITIES_PATH = '/plugins/dsh-crew-messaging/codex/capabilities'

export interface CodexControls { capabilities(): Promise<unknown>; create(operationId: string, cwd: string): Promise<{ sessionId: string }>; interrupt(operationId: string, sessionId: string, turnId: string): Promise<void>; interactions(sessionId: string): Promise<unknown>; respond(sessionId: string, id: string, method: string, response: unknown): Promise<void> }

export class CodexControlClient implements CodexControls {
  constructor(private readonly base: string) {}
  async capabilities(): Promise<unknown> { const response = await fetch(new URL('/v1/controls/capabilities', this.base), { signal: AbortSignal.timeout(1_500) }); if (!response.ok) throw new Error(`Codex controls failed (${response.status})`); return await response.json() }
  async create(operationId: string, cwd: string): Promise<{ sessionId: string }> { const value = await this.call('/v1/controls/threads', { operation_id: operationId, cwd }) as Record<string, unknown>; if (typeof value.session_id !== 'string') throw new Error('Codex controls returned an invalid create receipt'); return { sessionId: value.session_id } }
  async interrupt(operationId: string, sessionId: string, turnId: string): Promise<void> { await this.call('/v1/controls/interrupt', { operation_id: operationId, session_id: sessionId, turn_id: turnId }) }
  async interactions(sessionId: string): Promise<unknown> { const response = await fetch(new URL(`/v1/controls/interactions?${new URLSearchParams({ session_id: sessionId })}`, this.base), { signal: AbortSignal.timeout(1_500) }); if (!response.ok) throw new Error(`Codex controls failed (${response.status})`); return await response.json() }
  async respond(sessionId: string, id: string, method: string, response: unknown): Promise<void> { await this.call('/v1/controls/interactions/respond', { session_id: sessionId, id, method, response }) }
  private async call(path: string, body: unknown): Promise<unknown> { const response = await fetch(new URL(path, this.base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5_000) }); const value = await response.json(); if (!response.ok) throw new Error(typeof value?.error === 'string' ? value.error : `Codex controls failed (${response.status})`); return value }
}

export function codexControlHandler(controls: CodexControls): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    try {
      const body = await read(request); const value = body as Record<string, unknown>
      if (request.method === 'GET' && request.url === CREW_CODEX_CAPABILITIES_PATH) { write(response, 200, await controls.capabilities()); return }
      if (request.method === 'GET' && request.url?.startsWith(CREW_CODEX_INTERACTIONS_PATH)) { write(response, 200, await controls.interactions(new URL(request.url, 'http://localhost').searchParams.get('session_id') ?? '')); return }
      if (request.method !== 'POST') { response.writeHead(405, { allow: 'GET, POST' }); response.end(); return }
      if (request.url === CREW_CODEX_CREATE_PATH) { write(response, 200, await controls.create(required(value, 'operation_id'), optional(value, 'cwd'))); return }
      if (request.url === CREW_CODEX_INTERRUPT_PATH) { await controls.interrupt(required(value, 'operation_id'), required(value, 'session_id'), required(value, 'turn_id')); write(response, 200, { ok: true }); return }
      if (request.url === CREW_CODEX_RESPOND_PATH) { await controls.respond(required(value, 'session_id'), required(value, 'id'), required(value, 'method'), value.response); write(response, 200, { ok: true }); return }
      response.writeHead(404); response.end()
    } catch (error) { write(response, error instanceof BodyTooLarge ? 413 : 400, { error: error instanceof Error ? error.message : 'Codex control failed' }) }
  }
}
class BodyTooLarge extends Error {}
async function read(request: IncomingMessage): Promise<unknown> { if (request.method === 'GET') return {}; const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.length; if (size > 32 * 1024) throw new BodyTooLarge('control request is too large'); chunks.push(value) } return JSON.parse(Buffer.concat(chunks).toString('utf8')) }
function required(value: Record<string, unknown>, key: string): string { const result = value[key]; if (typeof result !== 'string' || result.trim() === '') throw new Error(`${key} is required`); return result }
function optional(value: Record<string, unknown>, key: string): string { const result = value[key]; return typeof result === 'string' ? result : '' }
function write(response: ServerResponse, status: number, value: unknown): void { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)) }
