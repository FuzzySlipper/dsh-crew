/**
 * dsh-crew-inject: one route that puts a message into a live root session's
 * next-step inbox with `agent.inject`, which never wakes the agent. A running
 * turn takes it at its next step boundary; an idle agent keeps it until its
 * next turn, whose first step takes it. crew-dsh uses it for no_wake delivery,
 * where `session/prompt mode:'steer'` would start a turn on an idle session.
 *
 * The route is on the shared `/api` channel, so the host's own trust and
 * authentication (the browser cookie or an API operator from /connect) apply
 * before it runs, and only owner peers reach it.
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-client-connection'
import { createUserMessage, type UserMessage } from '@deepseek-ai/dsh-llm'
import type { SessionId } from '@deepseek-ai/dsh-session'

export const name = 'dsh-crew-inject'
export const inject = ['agents', 'connection']

/** POST {sessionId, requestId, content} -> {accepted: true}. */
export const CREW_INJECT_PATH = '/api/crew-inject/inject'

interface InjectRequest {
  readonly sessionId: string
  readonly requestId: string
  readonly content: string
}

export function apply(ctx: Context): void {
  ctx.connection.fetch.register({
    path: CREW_INJECT_PATH,
    methods: ['POST'],
    requestBody: 'buffered',
    fetch: async request => handle(ctx, request),
  })
}

async function handle(ctx: Context, request: Request): Promise<Response> {
  const body = parse(await request.json().catch(() => undefined))
  if (body === undefined) return reply(400, { accepted: false, code: 'gateway/bad-request', message: 'sessionId, requestId and non-empty content are required' })
  const agent = ctx.agents.roots().find(candidate => candidate.id === body.sessionId as SessionId)
  if (agent === undefined) {
    // Never 404: crew-dsh reads a 404 as this route not being installed.
    const code = ctx.agents.get(body.sessionId as SessionId) === undefined ? 'session/not-loaded' : 'session/subagent'
    return reply(409, { accepted: false, code, message: `session "${body.sessionId}" has no live root agent` })
  }
  // The check and the insertion run without an await between them, so a
  // repeated request cannot insert twice.
  if (holdsRequest(agent, body.requestId)) return reply(200, { accepted: true, replayed: true })
  agent.inject(createUserMessage({ content: [{ type: 'text', text: body.content }], source: { kind: 'user', rpcId: body.requestId as never } }))
  return reply(200, { accepted: true })
}

function parse(value: unknown): InjectRequest | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { sessionId, requestId, content } = value as Record<string, unknown>
  if (typeof sessionId !== 'string' || sessionId === '' || typeof requestId !== 'string' || requestId === '') return undefined
  if (typeof content !== 'string' || content.trim() === '') return undefined
  return { sessionId, requestId, content }
}

/**
 * The same test as session/prompt's own `hasPromptRequest`: a user-sourced
 * message with this rpcId in either inbox or in the session history. The
 * message carries session/prompt's source shape, so crew-dsh's reconcile
 * reads (session/state queue, inbox splices, user messages) find it too.
 */
function holdsRequest(agent: Agent, requestId: string): boolean {
  const matches = (message: UserMessage): boolean => {
    const source = message.source as { kind: string; rpcId?: string }
    return source.kind === 'user' && source.rpcId === requestId
  }
  if (agent.inbox.nextTurn.some(matches) || agent.inbox.nextStep.some(matches)) return true
  // oxlint-disable-next-line typescript/no-deprecated -- the same history read session/prompt makes.
  return agent.session.snapshotEvents().some(event => event.type === 'user/message' && matches(event.data as UserMessage))
}

function reply(status: number, value: unknown): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}
