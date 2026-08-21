/** DSH provider entry point for the local crew messaging fabric. */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { resolveSessionPreset } from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { FabricClient } from './http.ts'
import { CrewMessagingService, type CrewMessagingConfig, type NativeMessage, type RuntimeAgent } from './service.ts'
import { installScopedTools } from './tools.ts'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'crew-messaging': { kind: 'crew-messaging'; messageId: string; deliveryId: string; senderAddress: string; recipientAddress: string; form: 'relay' }
  }
}

/** Cordis provider plus consumer: it owns only its adapter lease and created cold-root handles. */
export class CrewMessagingProvider extends Service {
  static inject = ['agents', 'sessions']
  private readonly runtime: DshRuntime
  private readonly service: CrewMessagingService

  constructor(ctx: Context, config: CrewMessagingConfig = {}) {
    super(ctx, 'crewMessaging')
    this.runtime = new DshRuntime(ctx)
    this.service = new CrewMessagingService(new FabricClient(config.url ?? 'http://127.0.0.1:8787'), this.runtime, config)
    const disposeTools = installScopedTools(ctx, this.service)
    ctx.effect(() => {
      void this.service.start().catch(error => ctx.logger.warn(`crew messaging start: ${String(error)}`))
      return async () => { disposeTools(); await this.service.dispose(); await this.runtime.dispose() }
    }, 'crewMessaging.lifecycle()')
  }
}

class DshRuntime {
  private readonly handles = new Map<string, AgentHandle>()
  private readonly resumes = new Map<string, Promise<Agent | undefined>>()
  constructor(private readonly ctx: Context) {}

  live(sessionId: string): RuntimeAgent | undefined { const agent = this.root(sessionId); return agent === undefined ? undefined : this.wrap(agent) }
  async resume(sessionId: string): Promise<RuntimeAgent | undefined> {
    const live = this.live(sessionId); if (live !== undefined) return live
    let pending = this.resumes.get(sessionId)
    if (pending === undefined) {
      pending = this.resumeExact(sessionId).finally(() => { this.resumes.delete(sessionId) })
      this.resumes.set(sessionId, pending)
    }
    const agent = await pending
    return agent === undefined ? undefined : this.wrap(agent)
  }
  async inspect(sessionId: string): Promise<readonly NativeMessage[] | undefined> {
    const live = this.root(sessionId)
    if (live !== undefined) return acceptedMessages(live.session.events)
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence === undefined) return undefined
    try { return acceptedMessages((await persistence.inspect(sessionId as SessionId)).events) } catch { return undefined }
  }
  async flush(agent: RuntimeAgent): Promise<boolean> { return await this.ctx.sessions.flush((agent as DshAgent).agent.session) }
  message(delivery: { delivery_id: string }, envelope: { message_id: string; sender_address: string; recipient_address: string; body: string }): NativeMessage {
    return createUserMessage({ content: [{ type: 'text', text: envelope.body }], source: { kind: 'crew-messaging', messageId: envelope.message_id, deliveryId: delivery.delivery_id, senderAddress: envelope.sender_address, recipientAddress: envelope.recipient_address, form: 'relay' } }) as unknown as NativeMessage
  }
  onStatus(listener: (agent: RuntimeAgent) => void): () => void { return this.ctx.on('agent/status', ({ agent }) => { listener(this.wrap(agent)) }) }
  async dispose(): Promise<void> { await Promise.all([...this.handles.values()].map(handle => handle.dispose())); this.handles.clear() }

  private wrap(agent: Agent): DshAgent { return { agent, sessionId: String(agent.id), get status() { return agent.status }, followup: message => { agent.followup(message as never) } } }
  private async resumeExact(sessionId: string): Promise<Agent | undefined> {
    const id = sessionId as SessionId
    const existing = this.root(sessionId); if (existing !== undefined) return existing
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence === undefined) return undefined
    const inspected = await persistence.inspect(id)
    if (inspected.meta.origin === 'subagent') return undefined
    const afterInspect = this.root(sessionId); if (afterInspect !== undefined) return afterInspect
    const preset = resolveSessionPreset({ header: inspected.meta, events: inspected.events })
    const presets = this.ctx.get('agentPresets')
    try {
      const handle = await this.ctx.agents.resume({
        resumeSessionId: id,
        ...(this.ctx.get('agentDefaultModel') === undefined ? {} : { agentOptions: this.ctx.agentDefaultModel.currentSelection() }),
        ...(presets === undefined || preset === undefined ? {} : { setup: async agentCtx => { await presets.mount(agentCtx, preset) } }),
      })
      if (!this.ctx.agents.roots().includes(handle.agent)) { await handle.dispose(); throw new Error(`session ${sessionId} resumed as a non-root`) }
      this.handles.set(sessionId, handle)
      return handle.agent
    } catch (error: unknown) {
      const winner = this.root(sessionId)
      if (winner !== undefined) return winner
      throw error
    }
  }
  /** A bound root never adopts a same-id live subagent. */
  private root(sessionId: string): Agent | undefined { return this.ctx.agents.roots().find(agent => agent.id === sessionId as SessionId) }
}

interface DshAgent extends RuntimeAgent { readonly agent: Agent }

/** Fold durable inbox splices in their independent next-turn and next-step coordinate spaces. */
export function acceptedMessages(events: readonly SessionEvent[]): NativeMessage[] {
  const messages: NativeMessage[] = []
  const pending = { 'next-turn': [] as NativeMessage[], 'next-step': [] as NativeMessage[] }
  for (const event of events) {
    if (event.type === 'user/message') messages.push(event.data as unknown as NativeMessage)
    if (event.type === 'agent/inbox/spliced') {
      pending[event.data.target].splice(event.data.start, event.data.removedCount ?? 0, ...(event.data.inserted as unknown as NativeMessage[]))
    }
  }
  return [...messages, ...pending['next-turn'], ...pending['next-step']]
}

export function apply(ctx: Context, config: CrewMessagingConfig = {}): void { ctx.plugin(CrewMessagingProvider, config) }

export default apply
