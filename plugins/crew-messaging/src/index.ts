/** DSH provider entry point for the local crew messaging fabric. */

import { Context, Service } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import type { SessionEvent, SessionId } from '@deepseek-ai/dsh-session'
import type {} from '@deepseek-ai/dsh-session-persistence'
import { foldSessionTitle } from '@deepseek-ai/dsh-session-title'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { resolveSessionPreset } from '@deepseek-ai/dsh-agent-presets'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-presets'
import { FabricClient } from './http.ts'
import { CrewMessagingService, type CrewMessagingConfig, type CrewMessagingStatus, type DirectoryEntry, type NativeMessage, type RuntimeAgent } from './service.ts'
import type { AddressDiscovery, DiscoveredBinding } from './addressing.ts'
import { frameCrewDelivery } from './framing.ts'
import { installScopedTools } from './tools.ts'
import { CREW_DASHBOARD_PATH, crewDashboardHandler, dashboardTuning } from './dashboard/host.ts'
import {
  CREW_SESSION_EVENTS_PATH, CREW_SESSION_EVENTS_STREAM_PATH, CREW_SESSION_PROMPT_PATH, CREW_SESSIONS_PATH,
  crewForeignSessionEventsHandler, crewForeignSessionEventsStreamHandler, crewForeignSessionPromptHandler, crewForeignSessionsHandler,
} from './dashboard/foreign-sessions.ts'
import { CodexControlClient, codexControlHandler, CREW_CODEX_CAPABILITIES_PATH, CREW_CODEX_CREATE_PATH, CREW_CODEX_INTERRUPT_PATH, CREW_CODEX_INTERACTIONS_PATH, CREW_CODEX_RESPOND_PATH } from './dashboard/codex-controls.ts'

interface WebRouteHost { register(route: { kind: 'exact'; path: string; handler: (request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) => void | Promise<void> }): () => void }

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'crew-messaging': { kind: 'crew-messaging'; messageId: string; deliveryId: string; senderAddress: string; recipientAddress: string; form: 'relay' }
  }
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    crewMessaging: CrewMessagingProvider
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
    this.service = new CrewMessagingService(new FabricClient(config.url ?? 'http://127.0.0.1:8787'), this.runtime, config, this.runtime)
    const dashboard = crewDashboardHandler({
      adapter: this.service,
      tuning: dashboardTuning(config),
      fabricUrl: config.url ?? 'http://127.0.0.1:8787',
    })
    const fabricUrl = config.url ?? 'http://127.0.0.1:8787'
    const sessions = crewForeignSessionsHandler({ fabricUrl })
    const events = crewForeignSessionEventsHandler({ fabricUrl })
    const stream = crewForeignSessionEventsStreamHandler({ fabricUrl })
    const prompt = crewForeignSessionPromptHandler({ adapter: this.service })
    const controls = codexControlHandler(new CodexControlClient(config.codexControlUrl ?? 'http://127.0.0.1:8788'))
    ctx.inject(['webServer'], webCtx => {
      const webServer = webCtx.get('webServer') as WebRouteHost
      webCtx.effect(() => webServer.register({ kind: 'exact', path: CREW_DASHBOARD_PATH, handler: dashboard }), 'crew-messaging: dashboard route')
      webCtx.effect(() => webServer.register({ kind: 'exact', path: CREW_SESSIONS_PATH, handler: sessions }), 'crew-messaging: foreign sessions route')
      webCtx.effect(() => webServer.register({ kind: 'exact', path: CREW_SESSION_EVENTS_PATH, handler: events }), 'crew-messaging: foreign session events route')
      webCtx.effect(() => webServer.register({ kind: 'exact', path: CREW_SESSION_EVENTS_STREAM_PATH, handler: stream }), 'crew-messaging: foreign session event stream route')
      webCtx.effect(() => webServer.register({ kind: 'exact', path: CREW_SESSION_PROMPT_PATH, handler: prompt }), 'crew-messaging: foreign session prompt route')
      webCtx.effect(() => webServer.register({ kind: 'exact', path: CREW_CODEX_CREATE_PATH, handler: controls }), 'crew-messaging: Codex create route')
      webCtx.effect(() => webServer.register({ kind: 'exact', path: CREW_CODEX_CAPABILITIES_PATH, handler: controls }), 'crew-messaging: Codex capabilities route')
      webCtx.effect(() => webServer.register({ kind: 'exact', path: CREW_CODEX_INTERRUPT_PATH, handler: controls }), 'crew-messaging: Codex interrupt route')
      webCtx.effect(() => webServer.register({ kind: 'exact', path: CREW_CODEX_INTERACTIONS_PATH, handler: controls }), 'crew-messaging: Codex interactions route')
      webCtx.effect(() => webServer.register({ kind: 'exact', path: CREW_CODEX_RESPOND_PATH, handler: controls }), 'crew-messaging: Codex response route')
    })
    const disposeTools = installScopedTools(ctx, this.service)
    ctx.effect(() => {
      void this.service.start().catch(error => ctx.logger.warn(`crew messaging start: ${String(error)}`))
      return async () => { disposeTools(); await this.service.dispose(); await this.runtime.dispose() }
    }, 'crewMessaging.lifecycle()')
  }

  /** Model-safe directory projection for other same-process plugin consumers. */
  directory(): readonly DirectoryEntry[] { return this.service.directory() }
  /** Model-safe local adapter state for other same-process plugin consumers. */
  status(): CrewMessagingStatus { return this.service.status() }
  /** Refresh subscription emitted after the directory map is coherent. */
  onDirectoryChanged(listener: () => void): () => void { return this.service.onDirectoryChanged(listener) }
  /** Submit a browser workbench prompt through this provider's held fabric lease. */
  sendWorkbench(sessionId: string, operationId: string, text: string): Promise<{ messageId: string; replayed: boolean }> { return this.service.sendWorkbench(sessionId, operationId, text) }
}

class DshRuntime implements AddressDiscovery {
  private readonly handles = new Map<string, AgentHandle>()
  private readonly resumes = new Map<string, Promise<Agent | undefined>>()
  private coldTitles = new Map<string, { readonly revision: unknown; readonly binding: DiscoveredBinding | undefined }>()
  constructor(private readonly ctx: Context) {}

  async discover(): Promise<readonly DiscoveredBinding[]> {
    const values = new Map<string, DiscoveredBinding>()
    for (const agent of this.ctx.agents.roots()) this.addDiscovered(values, String(agent.id), agent.session.header.origin, agent.session.events)
    const persistence = this.ctx.get('sessionPersistence')
    if (persistence === undefined) return [...values.values()]
    const snapshots = await persistence.listSnapshots()
    const nextCold = new Map<string, { readonly revision: unknown; readonly binding: DiscoveredBinding | undefined }>()
    for (const snapshot of snapshots) {
      const sessionId = String(snapshot.header.id)
      if (values.has(sessionId) || snapshot.header.origin === 'subagent') continue
      const cached = this.coldTitles.get(sessionId)
      if (cached?.revision === snapshot.revision) {
        nextCold.set(sessionId, cached)
      } else {
        const inspected = await persistence.inspect(snapshot.header.id)
        const binding = discoveredFromEvents(sessionId, inspected.meta.origin, inspected.events)
        nextCold.set(sessionId, { revision: snapshot.revision, binding })
      }
      const binding = nextCold.get(sessionId)?.binding
      if (binding !== undefined) values.set(sessionId, binding)
    }
    this.coldTitles = nextCold
    return [...values.values()]
  }
  onChanged(listener: () => void): () => void {
    const stopEvent = this.ctx.on('session/event', (session, event) => {
      if ((event as { type: string }).type === 'session/title' && this.root(String(session.id)) !== undefined) listener()
    })
    const stopDisposed = this.ctx.on('session/disposed', () => listener())
    return () => { stopEvent(); stopDisposed() }
  }

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
    return createUserMessage({ content: [{ type: 'text', text: frameCrewDelivery(envelope) }], source: { kind: 'crew-messaging', messageId: envelope.message_id, deliveryId: delivery.delivery_id, senderAddress: envelope.sender_address, recipientAddress: envelope.recipient_address, form: 'relay' } }) as unknown as NativeMessage
  }
  onStatus(listener: (agent: RuntimeAgent) => void): () => void { return this.ctx.on('agent/status', ({ agent }) => { listener(this.wrap(agent)) }) }
  async dispose(): Promise<void> { await Promise.all([...this.handles.values()].map(handle => handle.dispose())); this.handles.clear() }

  private wrap(agent: Agent): DshAgent { return { agent, sessionId: String(agent.id), get status() { return agent.status }, followup: message => { agent.followup(message as never) } } }
  private addDiscovered(values: Map<string, DiscoveredBinding>, sessionId: string, origin: 'subagent' | undefined, events: readonly SessionEvent[]): void {
    const binding = discoveredFromEvents(sessionId, origin, events)
    if (binding !== undefined) values.set(sessionId, binding)
  }
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

/** Fold only durable explicit renames; automatic names never become fabric addresses. */
export function explicitUserTitle(events: readonly SessionEvent[]): string | undefined {
  const title = foldSessionTitle(events)
  return title?.source.kind === 'user' ? title.title : undefined
}

/** Convert one eligible root's durable log into a title address, if the user pinned one. */
function discoveredFromEvents(sessionId: string, origin: 'subagent' | undefined, events: readonly SessionEvent[]): DiscoveredBinding | undefined {
  if (origin === 'subagent') return undefined
  const title = explicitUserTitle(events)
  return title === undefined ? undefined : { address: title, sessionId }
}

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

export type { CrewMessagingStatus, DirectoryEntry } from './service.ts'

export default apply
