/**
 * Keyless agent-box proof: the real Go fabric joins a current-source DSH
 * Cordis context, JSONL persistence, AgentLoop, MockAdapter, and provider.
 */

import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Context } from '@deepseek-ai/cordis'
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent'
import { CallId, createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import AgentLoop from '../../../research/deepseek-harness/packages/core/agent-loop/src/index.ts'
import { mountAgentLoopTestDependencies } from '../../../research/deepseek-harness/packages/test-support/agent-loop-testkit/src/index.ts'
import JsonlSessionPersistence from '../../../research/deepseek-harness/packages/session/session-persistence-jsonl/src/index.ts'
import { MockAdapter, textResponse } from '../../../research/deepseek-harness/packages/core/agent-loop/tests/mock-adapter.ts'
import { CrewMessagingProvider, acceptedMessages } from '../src/index.ts'
import { FabricClient } from '../src/http.ts'

const run = promisify(execFile)
const serviceRepository = fileURLToPath(new URL('../../../../crew-services/', import.meta.url))

function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

async function unusedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve()) })
  const address = server.address()
  check(address !== null && typeof address !== 'string', 'could not reserve a loopback port')
  await new Promise<void>((resolve, reject) => server.close(error => error === undefined ? resolve() : reject(error)))
  return address.port
}

async function until(description: string, predicate: () => boolean | Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    if (await predicate()) return
    await new Promise(resolve => setTimeout(resolve, 25))
  }
  throw new Error(`timed out waiting for ${description}`)
}

async function start(binary: string, database: string, port: number): Promise<ChildProcess> {
  const process = spawn(binary, ['-listen', `127.0.0.1:${String(port)}`, '-db', database], { stdio: 'pipe' })
  const baseUrl = `http://127.0.0.1:${String(port)}`
  await until('Go HTTP binary readiness', async () => {
    try { return (await fetch(`${baseUrl}/readyz`)).ok } catch { return false }
  })
  return process
}

async function stop(process: ChildProcess): Promise<void> {
  if (process.exitCode !== null) return
  const exited = new Promise<void>(resolve => process.once('exit', () => resolve()))
  process.kill('SIGTERM')
  await exited
}

function crewMessages(agent: Agent) {
  return acceptedMessages(agent.session.events).filter(message => message.source.kind === 'crew-messaging')
}

function nextTurnCrewCount(agent: Agent): number {
  return agent.session.events.filter(event => event.type === 'agent/inbox/spliced'
    && event.data.target === 'next-turn'
    && event.data.inserted.some(message => (message as { source?: { kind?: string } }).source?.kind === 'crew-messaging')).length
}

function messageText(message: unknown): string {
  const content = (message as { content?: Array<{ type?: string; text?: string }> }).content ?? []
  return content.flatMap(block => block.type === 'text' && block.text !== undefined ? [block.text] : []).join('')
}

interface DecodedCrewFrame {
  header: {
    type: 'crew_delivery'
    message_id: string
    from: string
    to: string
    kind: 'ordinary' | 'reply'
    reply_to_message_id?: string
  }
  instruction: string
  body: string
}

/** Decode the model-visible contract without depending on plugin internals. */
function decodeCrewFrame(message: unknown): DecodedCrewFrame {
  const lines = messageText(message).split('\n')
  check(lines.length === 5, `crew delivery frame has unexpected line count: ${String(lines.length)}`)
  check(lines[2] === '<crew-message-body encoding="json">', 'crew delivery frame lost its body marker')
  check(lines[4] === '</crew-message-body>', 'crew delivery frame lost its closing marker')
  const header = JSON.parse(lines[0]!) as Record<string, unknown>
  check(header.type === 'crew_delivery', 'crew delivery frame has the wrong type')
  check(typeof header.message_id === 'string' && header.message_id.length > 0, 'crew delivery frame lacks its message id')
  check(typeof header.from === 'string' && header.from.length > 0, 'crew delivery frame lacks its sender alias')
  check(typeof header.to === 'string' && header.to.length > 0, 'crew delivery frame lacks its recipient alias')
  check(header.kind === 'ordinary' || header.kind === 'reply', 'crew delivery frame has the wrong kind')
  if (header.kind === 'reply') check(typeof header.reply_to_message_id === 'string' && header.reply_to_message_id.length > 0, 'reply frame lacks its linked message id')
  const body = JSON.parse(lines[3]!)
  check(typeof body === 'string', 'crew delivery frame body is not a JSON string')
  return {
    header: {
      type: 'crew_delivery',
      message_id: header.message_id as string,
      from: header.from as string,
      to: header.to as string,
      kind: header.kind,
      ...(typeof header.reply_to_message_id === 'string' ? { reply_to_message_id: header.reply_to_message_id } : {}),
    },
    instruction: lines[1]!,
    body,
  }
}

async function sendTool(ctx: Context, agent: Agent, call: string, recipient: string, text: string, replyToMessageId?: string): Promise<void> {
  const result = await ctx.tools.execute({
    signal: AbortSignal.timeout(2_000),
    callId: CallId(call),
    name: 'crew_message',
    arguments: { recipient, text, ...(replyToMessageId === undefined ? {} : { reply_to_message_id: replyToMessageId }) },
    agent,
  })
  check(!result.isError, `crew_message ${call} failed: ${JSON.stringify(result.content)}`)
}

async function readMessages(baseUrl: string): Promise<unknown[]> {
  const response = await fetch(`${baseUrl}/v1/messages`)
  check(response.ok, `message readback failed: ${String(response.status)}`)
  const value: unknown = await response.json()
  check(typeof value === 'object' && value !== null && 'messages' in value && Array.isArray(value.messages), 'message readback did not return messages')
  return value.messages
}

async function main(): Promise<void> {
  const workspace = await mkdtemp(join(tmpdir(), 'crew-messaging-probe-'))
  const binary = join(workspace, 'crew-messaging')
  const database = join(workspace, 'crew-messaging.sqlite')
  const persistenceRoot = join(workspace, 'sessions')
  const port = await unusedPort()
  const baseUrl = `http://127.0.0.1:${String(port)}`
  let process: ChildProcess | undefined
  let ctx: Context | undefined
  let betaHandle: AgentHandle | undefined
  try {
    await run('go', ['build', '-o', binary, './cmd/crew-messaging'], { cwd: serviceRepository })
    process = await start(binary, database, port)

    const harness = new Context()
    ctx = harness
    await mountAgentLoopTestDependencies(harness)
    await harness.plugin(JsonlSessionPersistence, { root: persistenceRoot, compression: 'none', writeBatchMaxDelayMs: 1 })
    await harness.plugin(AgentLoop, { agents: [] })
    const mock = new MockAdapter(['hang', textResponse('beta ordinary'), textResponse('beta cold one'), textResponse('beta cold two')])
    harness.llm.registerAdapter(['mock'], mock)
    const alphaHandle = await harness.agents.create({ sessionId: SessionId('root-alpha'), meta: { cwd: workspace }, agentOptions: { provider: 'mock', model: 'mock' } })
    betaHandle = await harness.agents.create({ sessionId: SessionId('root-beta'), meta: { cwd: workspace }, agentOptions: { provider: 'mock', model: 'mock' } })
    const alpha = alphaHandle.agent
    const beta = betaHandle.agent
    await harness.plugin(CrewMessagingProvider, { url: baseUrl, bindings: [{ address: 'alpha', sessionId: String(alpha.id) }, { address: 'beta', sessionId: String(beta.id) }], pollMs: 20 })
    const fabric = new FabricClient(baseUrl)
    await until('provider bindings', async () => (await fabric.listBindings()).addresses.length === 2)

    alpha.followup(createUserMessage({ content: [{ type: 'text', text: 'stay busy' }], source: { kind: 'user' } }))
    await until('alpha running', () => alpha.status === 'running' && mock.requests.length === 1)
    await sendTool(harness, alpha, 'alpha-ordinary', 'beta', 'hello beta')
    await sendTool(harness, alpha, 'alpha-ordinary', 'beta', 'hello beta')
    await until('one durable beta crew message', () => crewMessages(beta).length === 1)
    check(alpha.status === 'running' && mock.requests.length === 2, 'beta delivery steered or cancelled alpha instead of preserving its active turn')
    const first = crewMessages(beta)[0]!
    check(first.source.messageId.length > 0, 'beta delivery lacks its fabric message identity')
    const firstFrame = decodeCrewFrame(first)
    check(firstFrame.header.message_id === first.source.messageId
      && firstFrame.header.from === 'alpha'
      && firstFrame.header.to === 'beta'
      && firstFrame.header.kind === 'ordinary'
      && firstFrame.body === 'hello beta', 'ordinary delivery frame lost its aliases, identity, or body')
    check(firstFrame.instruction.includes(`recipient="alpha"`) && firstFrame.instruction.includes(`reply_to_message_id="${first.source.messageId}"`), 'ordinary delivery frame lost its linked-reply instruction')

    await sendTool(harness, beta, 'beta-reply', 'alpha', 'reply alpha', first.source.messageId)
    await until('alpha durable next-turn reply', () => nextTurnCrewCount(alpha) === 1)
    check(alpha.status === 'running' && mock.requests.length === 2, 'linked reply interrupted alpha instead of queuing next-turn work')
    const reply = crewMessages(alpha)[0]!
    const replyFrame = decodeCrewFrame(reply)
    check(replyFrame.header.message_id === reply.source.messageId
      && replyFrame.header.from === 'beta'
      && replyFrame.header.to === 'alpha'
      && replyFrame.header.kind === 'reply'
      && replyFrame.header.reply_to_message_id === first.source.messageId
      && replyFrame.body === 'reply alpha', 'linked reply frame lost aliases, identity, reply metadata, or body')
    check(replyFrame.instruction.includes(`recipient="beta"`) && replyFrame.instruction.includes(`reply_to_message_id="${reply.source.messageId}"`), 'linked reply frame lost its next-reply instruction')

    const beforeInspection = { alphaEvents: alpha.session.events.length, betaEvents: beta.session.events.length, deliveries: (await fabric.deliveries()).deliveries.length }
    await fabric.listBindings()
    await fabric.deliveries()
    await readMessages(baseUrl)
    check(alpha.session.events.length === beforeInspection.alphaEvents && beta.session.events.length === beforeInspection.betaEvents && (await fabric.deliveries()).deliveries.length === beforeInspection.deliveries, 'inspection actuated a DSH session or delivery')

    await betaHandle.dispose()
    betaHandle = undefined
    check(harness.agents.get(SessionId('root-beta')) === undefined, 'cold-resume preparation left beta live')
    await sendTool(harness, alpha, 'alpha-cold-1', 'beta', 'cold one')
    await sendTool(harness, alpha, 'alpha-cold-2', 'beta', 'cold two')
    await until('exact beta root resumed', () => harness.agents.roots().filter(agent => agent.id === SessionId('root-beta')).length === 1)
    const resumed = harness.agents.get(SessionId('root-beta'))!
    await until('two FIFO cold messages', () => crewMessages(resumed).length === 3)
    const coldFrames = crewMessages(resumed).slice(-2).map(decodeCrewFrame)
    const coldTexts = coldFrames.map(frame => frame.body)
    check(coldTexts.join('|') === 'cold one|cold two', `cold beta delivery was not FIFO: ${coldTexts.join('|')}`)
    check(coldFrames.every(frame => frame.header.from === 'alpha' && frame.header.to === 'beta' && frame.header.kind === 'ordinary'), 'cold delivery frame lost its aliases or kind')
    check(coldFrames.every(frame => frame.header.message_id.length > 0) && coldFrames[0]!.header.message_id !== coldFrames[1]!.header.message_id, 'cold delivery frames lost distinct message identities')

    await until('all four fabric acknowledgements', async () => {
      const values = await fabric.deliveries()
      return values.deliveries.length === 4 && values.deliveries.every(delivery => delivery.state === 'delivered')
    })
    const delivered = await fabric.deliveries()
    check(delivered.deliveries.length === 4 && delivered.deliveries.every(delivery => delivery.state === 'delivered'), `exact retry created another fabric delivery or an adapter delivery did not settle: ${JSON.stringify(delivered.deliveries)}`)

    await harness.fiber.dispose()
    ctx = undefined
    await stop(process)
    process = await start(binary, database, port)
    const restarted = new FabricClient(baseUrl)
    const bindings = await restarted.listBindings()
    const persisted = await restarted.deliveries()
    const messages = await readMessages(baseUrl)
    check(bindings.addresses.length === 2, 'restart lost directory bindings')
    check(persisted.deliveries.length === 4 && persisted.deliveries.every(delivery => delivery.state === 'delivered'), 'restart lost delivery records')
    check(messages.length === 4, 'restart lost immutable messages')
    console.log('agent-box probe passed: current DSH roots/tools/JSONL, exact retry, busy next-turn reply, cold FIFO resume, inspection, and SQLite restart')
  } finally {
    if (ctx !== undefined) await ctx.fiber.dispose()
    if (process !== undefined) await stop(process)
    await rm(workspace, { recursive: true, force: true })
  }
}

await main()
