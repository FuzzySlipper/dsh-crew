/** Scoped model tools; the Agent carrying each call is the sender authority. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { CrewMessagingService } from './service.ts'

const addressOutput = { type: 'object', additionalProperties: false, properties: { addresses: { type: 'array', required: true, items: { type: 'string' } } } } as const
const directoryOutput = { type: 'object', additionalProperties: false, properties: { entries: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { address: { type: 'string', required: true }, status: { type: 'string', required: true, enum: ['routable', 'ambiguous', 'conflict'] }, source: { type: 'string', required: true, enum: ['configured', 'session-title'] } } } } } } as const
const sendOutput = { type: 'object', additionalProperties: false, properties: { message_id: { type: 'string', required: true }, replayed: { type: 'boolean', required: true } } } as const

function caller(agent: Agent | undefined, name: string): Agent { if (agent === undefined) throw new Error(`${name} requires a calling Agent`); return agent }
function output(value: unknown): [{ type: 'text'; text: string }] { return [{ type: 'text', text: JSON.stringify(value) }] }

/** Reconcile installed session-scoped effects against the current effective roots. */
export function synchronizeScopedTools<T>(
  roots: readonly T[],
  installed: Map<T, () => void>,
  hasAddress: (root: T) => boolean,
  install: (root: T) => void,
): void {
  for (const root of roots) {
    if (hasAddress(root)) install(root)
    else {
      installed.get(root)?.()
      installed.delete(root)
    }
  }
  for (const [agent, dispose] of installed) {
    if (!roots.includes(agent)) {
      dispose()
      installed.delete(agent)
    }
  }
}

/** Install tools only for roots with a currently effective fabric address. */
export function installScopedTools(ctx: Context, service: CrewMessagingService): () => void {
  const installed = new Map<Agent, () => void>()
  const remove = (agent: Agent): void => { installed.get(agent)?.(); installed.delete(agent) }
  const install = (agent: Agent): void => {
    if (installed.has(agent) || !ctx.agents.roots().includes(agent) || service.addresses(String(agent.id)).length === 0) return
    const disposers: Array<() => unknown> = []
    try {
      disposers.push(agent.ctx.systemPrompt.section({ name: 'crew-messaging:policy', order: 65, text: () => 'Use crew_message to send a durable text message to a configured fabric address. A delivered crew message includes the exact recipient and reply_to_message_id to use for a linked reply.' }))
      disposers.push(agent.ctx.tools.register(defineTool({
        name: 'crew_addresses', description: 'List the fabric addresses bound to this exact session.', parameters: {}, output: { schema: addressOutput, render: (_args, value) => output(value) },
        async execute(_args, exec) { return { addresses: service.addresses(String(caller(exec.agent, 'crew_addresses').id)) } },
      })))
      disposers.push(agent.ctx.tools.register(defineTool({
        name: 'crew_directory', description: 'List human fabric aliases and whether each is routable, ambiguous, or occupied by another adapter.', parameters: {}, output: { schema: directoryOutput, render: (_args, value) => output(value) },
        async execute(_args, exec) { caller(exec.agent, 'crew_directory'); return { entries: [...service.directory()] } },
      })))
      disposers.push(agent.ctx.tools.register(defineTool({
        name: 'crew_message', description: 'Send a durable text message from this session to a configured fabric address.',
        parameters: { recipient: { type: 'string', required: true }, text: { type: 'string', required: true }, reply_to_message_id: { type: 'string' } },
        output: { schema: sendOutput, render: (_args, value) => output(value) },
        async execute(args, exec) {
          const agent = caller(exec.agent, 'crew_message')
          const sent = await service.send(String(agent.id), String(exec.callId), args.recipient, args.text, args.reply_to_message_id)
          return { message_id: sent.messageId, replayed: sent.replayed }
        },
      })))
    } catch (error: unknown) { for (const dispose of disposers.reverse()) void dispose(); throw error }
    installed.set(agent, () => { for (const dispose of disposers.reverse()) void dispose() })
  }
  const sync = (agent: Agent): void => {
    if (ctx.agents.roots().includes(agent) && service.addresses(String(agent.id)).length > 0) install(agent)
    else remove(agent)
  }
  const syncAll = (): void => { synchronizeScopedTools(ctx.agents.roots(), installed, agent => service.addresses(String(agent.id)).length > 0, install) }
  syncAll()
  const stopDirectory = service.onDirectoryChanged(syncAll)
  const stopCreated = ctx.on('agent/created', ({ agent }) => { sync(agent) })
  const stopDisposed = ctx.on('agent/disposed', ({ agent }) => { remove(agent) })
  return () => { stopDirectory(); stopCreated(); stopDisposed(); for (const dispose of installed.values()) void dispose(); installed.clear() }
}
