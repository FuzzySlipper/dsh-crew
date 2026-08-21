/** Scoped model tools; the Agent carrying each call is the sender authority. */

import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { CrewMessagingService } from './service.ts'

const addressOutput = { type: 'object', additionalProperties: false, properties: { addresses: { type: 'array', required: true, items: { type: 'string' } } } } as const
const sendOutput = { type: 'object', additionalProperties: false, properties: { message_id: { type: 'string', required: true }, replayed: { type: 'boolean', required: true } } } as const

function caller(agent: Agent | undefined, name: string): Agent { if (agent === undefined) throw new Error(`${name} requires a calling Agent`); return agent }
function output(value: unknown): [{ type: 'text'; text: string }] { return [{ type: 'text', text: JSON.stringify(value) }] }

/** Install tools only for roots named by explicit adapter bindings. */
export function installScopedTools(ctx: Context, service: CrewMessagingService): () => void {
  const installed = new Map<Agent, () => void>()
  const install = (agent: Agent): void => {
    if (installed.has(agent) || !ctx.agents.roots().includes(agent) || service.addresses(String(agent.id)).length === 0) return
    const disposers: Array<() => unknown> = []
    try {
      disposers.push(agent.ctx.systemPrompt.section({ name: 'crew-messaging:policy', order: 65, text: () => 'Use crew_message to send a durable text message to a configured fabric address. Replies must preserve the supplied message id.' }))
      disposers.push(agent.ctx.tools.register(defineTool({
        name: 'crew_addresses', description: 'List the fabric addresses bound to this exact session.', parameters: {}, output: { schema: addressOutput, render: (_args, value) => output(value) },
        async execute(_args, exec) { return { addresses: service.addresses(String(caller(exec.agent, 'crew_addresses').id)) } },
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
  for (const agent of ctx.agents.list()) install(agent)
  const stopCreated = ctx.on('agent/created', ({ agent }) => { install(agent) })
  const stopDisposed = ctx.on('agent/disposed', ({ agent }) => { installed.get(agent)?.(); installed.delete(agent) })
  return () => { stopCreated(); stopDisposed(); for (const dispose of installed.values()) void dispose(); installed.clear() }
}
