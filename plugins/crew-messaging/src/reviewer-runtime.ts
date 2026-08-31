/** DSH-owned, loopback-only reviewer worker runtime for Crew Review. */

import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Agent, AgentHandle, AgentOptions } from '@deepseek-ai/dsh-agent'
import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent-default-model'
import type {} from '@deepseek-ai/dsh-agent-presets'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap { 'reviewer-runtime': { kind: 'reviewer-runtime'; runId: string } }
}

/** Private loopback route used by the local crew-review process. */
export const CREW_REVIEWER_RUNTIME_PATH = '/plugins/dsh-crew-messaging/reviewer-runtime'

/** DSH-side reviewer selection and lifecycle settings. */
export interface ReviewerRuntimeConfig {
  reviewerProfilePath?: string
  reviewerPreset?: string
  reviewerProvider?: string
  reviewerModel?: string
  reviewerEffort?: string
  reviewerCapacity?: number
}

/** Structured completion mirrored by crew-services without exposing a DSH session identity. */
export interface ReviewCompletion {
  readonly verdict: 'looks_good' | 'changes_requested'
  readonly notes?: string
  readonly evidence?: string
  readonly new_findings?: readonly ReviewFinding[]
  readonly prior_finding_resolutions?: readonly PriorFindingResolution[]
}

interface ReviewFinding {
  readonly category: 'blocking_bug' | 'acceptance_gap' | 'test_weakness' | 'follow_up_candidate'
  readonly summary: string
  readonly notes?: string
  readonly file_references?: readonly string[]
  readonly test_commands?: readonly string[]
}

interface PriorFindingResolution {
  readonly finding_id: number
  readonly status: 'verified_fixed' | 'not_fixed' | 'superseded' | 'split_to_follow_up'
  readonly verification_note: string
}

interface ActiveRun {
  readonly id: string
  readonly completion: Promise<ReviewCompletion>
  result: Promise<RunResponse> | undefined
  resolve(value: ReviewCompletion): void
  reject(error: Error): void
  settled: boolean
}

interface ReviewerWorker {
  readonly id: string
  readonly handle: AgentHandle
  readonly workspace: string
  readonly operations: Set<string>
  readonly results: Map<string, RunResponse>
  active: ActiveRun | undefined
  released: boolean
}

interface StatusResponse { readonly ready: boolean; readonly capacity: number; readonly workers: number; readonly active: number; readonly error?: string }
interface AcquireResponse { readonly worker_id: string; readonly replayed: boolean }
interface RunResponse { readonly worker_id: string; readonly run_id: string; readonly completion: ReviewCompletion; readonly replayed: boolean }
interface ReleaseResponse { readonly worker_id: string; readonly released: boolean; readonly replayed: boolean }

const completionOutput = { type: 'object', additionalProperties: false, properties: { accepted: { type: 'boolean', required: true } } } as const
const completionParameters = {
    verdict: { type: 'string', required: true, enum: ['looks_good', 'changes_requested'] },
    notes: { type: 'string' }, evidence: { type: 'string' },
    prior_finding_resolutions: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      finding_id: { type: 'integer', required: true }, status: { type: 'string', required: true, enum: ['verified_fixed', 'not_fixed', 'superseded', 'split_to_follow_up'] }, verification_note: { type: 'string', required: true },
    } } },
    new_findings: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      category: { type: 'string', required: true, enum: ['blocking_bug', 'acceptance_gap', 'test_weakness', 'follow_up_candidate'] }, summary: { type: 'string', required: true }, notes: { type: 'string' },
      file_references: { type: 'array', items: { type: 'string' } }, test_commands: { type: 'array', items: { type: 'string' } },
    } } },
} as const

/** Validate completion semantics before the value can leave the DSH worker. */
export function validateCompletion(value: unknown): ReviewCompletion {
  const input = record(value)
  if (input === undefined || (input.verdict !== 'looks_good' && input.verdict !== 'changes_requested')) throw new Error('complete_review requires a valid verdict')
  rejectUnexpectedKeys(input, ['verdict', 'notes', 'evidence', 'new_findings', 'prior_finding_resolutions'], 'complete_review')
  const findings = optionalFindings(input.new_findings)
  const resolutions = optionalResolutions(input.prior_finding_resolutions)
  if (input.verdict === 'looks_good' && findings.length > 0) throw new Error('looks_good cannot contain new_findings')
  if (input.verdict === 'changes_requested' && findings.length === 0) throw new Error('changes_requested requires a current-round new finding')
  return {
    verdict: input.verdict,
    ...optionalText('notes', input.notes), ...optionalText('evidence', input.evidence),
    ...(findings.length === 0 ? {} : { new_findings: findings }),
    ...(resolutions.length === 0 ? {} : { prior_finding_resolutions: resolutions }),
  }
}

/** A trusted local controller which owns every hidden DSH reviewer worker. */
export class ReviewerRuntime {
  private readonly workers = new Map<string, ReviewerWorker>()
  private readonly operations = new Map<string, string>()
  private readonly acquisitions = new Map<string, { readonly workspace: string; readonly result: Promise<AcquireResponse> }>()
  private readonly capacity: number
  private readonly options: AgentOptions | undefined
  private readonly profile: Promise<string>
  private readonly configurationError: string | undefined
  private controller: AgentHandle | undefined
  private controllerCreating: Promise<AgentHandle> | undefined
  private reservations = 0
  private stopped = false

  constructor(private readonly ctx: Context, private readonly config: ReviewerRuntimeConfig) {
    const provider = config.reviewerProvider
    const model = config.reviewerModel
    this.configurationError = (provider === undefined) !== (model === undefined)
      ? 'reviewerProvider and reviewerModel must be configured together'
      : config.reviewerCapacity === undefined || !Number.isInteger(config.reviewerCapacity) || config.reviewerCapacity < 1
        ? 'reviewerCapacity must be a positive integer'
        : config.reviewerProfilePath === undefined || config.reviewerProfilePath.trim() === ''
          ? 'reviewerProfilePath is required'
          : undefined
    this.capacity = config.reviewerCapacity ?? 0
    this.options = provider === undefined || model === undefined
      ? undefined
      : { provider, model, ...(config.reviewerEffort === undefined ? {} : { reasoningEffort: config.reviewerEffort as never }) }
    this.profile = config.reviewerProfilePath === undefined ? Promise.resolve('') : readFile(config.reviewerProfilePath, 'utf8').then(profile => `${profile.trim()}\n\nManaged review runtime: use only complete_review to submit a review verdict. Do not call Den directly. A looks_good verdict cannot include new findings. A changes_requested verdict requires at least one current-round new finding.\n`)
  }

  /** Return configuration and aggregate pool state without agent identities. */
  async status(): Promise<StatusResponse> {
    const error = await this.readinessError()
    return { ready: error === undefined && !this.stopped, capacity: this.capacity, workers: this.workers.size, active: [...this.workers.values()].filter(worker => worker.active !== undefined).length, ...(error === undefined ? {} : { error }) }
  }

  /** Idempotently reserve one hidden reviewer worker for a local operation. */
  async acquire(operationId: string, workspace: string): Promise<AcquireResponse> {
    this.requireReady()
    const current = this.operations.get(operationId)
    if (current !== undefined) {
      const worker = this.requireWorker(current)
      if (worker.workspace !== workspace) throw new Error('operation_id already belongs to a different workspace')
      return { worker_id: worker.id, replayed: true }
    }
    const pending = this.acquisitions.get(operationId)
    if (pending !== undefined) {
      if (pending.workspace !== workspace) throw new Error('operation_id already belongs to a different workspace')
      const result = await pending.result
      return { ...result, replayed: true }
    }
    if (this.workers.size + this.reservations >= this.capacity) throw new Error('reviewer capacity reached')
    this.reservations++
    const result = this.createWorker(operationId, workspace).finally(() => {
      this.reservations--
      this.acquisitions.delete(operationId)
    })
    this.acquisitions.set(operationId, { workspace, result })
    return await result
  }

  private async createWorker(operationId: string, workspace: string): Promise<AcquireResponse> {
    const readiness = await this.readinessError()
    if (readiness !== undefined) throw new Error(readiness)
    const controller = await this.ensureController(workspace)
    const id = randomUUID()
    const profile = await this.profile
    const runtime = this
    const workerOptions = this.resolveAgentOptions()
    const handle = await controller.agent.ctx.agents.create({
      sessionId: randomUUID() as never,
      meta: { cwd: workspace, parentSession: controller.agent.id, origin: 'subagent' },
      ...(workerOptions === undefined ? {} : { agentOptions: workerOptions }),
      setup: async workerCtx => {
        if (this.config.reviewerPreset !== undefined) await workerCtx.agentPresets.mount(workerCtx, this.config.reviewerPreset)
        workerCtx.systemPrompt.section({ name: 'crew-review:profile', order: 65, text: profile })
        workerCtx.tools.register(defineTool({
          name: 'complete_review', description: 'Submit the structured managed review result. A looks_good verdict cannot include new findings. A changes_requested verdict requires at least one current-round new finding.',
          parameters: completionParameters, output: { schema: completionOutput, render: (_args, output) => [{ type: 'text', text: JSON.stringify(output) }] },
          async execute(args) { return await runtime.acceptCompletion(id, args) },
        }))
      },
    })
    const worker: ReviewerWorker = { id, handle, workspace, operations: new Set([operationId]), results: new Map(), active: undefined, released: false }
    this.workers.set(id, worker); this.operations.set(operationId, id)
    return { worker_id: id, replayed: false }
  }

  /** Drive exactly one worker turn and return only its accepted completion. */
  async run(workerId: string, runId: string, prompt: string, signal?: AbortSignal): Promise<RunResponse> {
    const worker = this.requireWorker(workerId)
    const replay = worker.results.get(runId)
    if (replay !== undefined) return { ...replay, replayed: true }
    if (worker.active !== undefined) {
      if (worker.active.id !== runId || worker.active.result === undefined) throw new Error('reviewer worker already has an active run')
      const result = await worker.active.result
      return { ...result, replayed: true }
    }
    const active = deferred(runId)
    worker.active = active
    active.result = this.drive(worker, active, prompt, signal)
    return await active.result
  }

  private async drive(worker: ReviewerWorker, active: ActiveRun, prompt: string, signal?: AbortSignal): Promise<RunResponse> {
    const stop = (): void => { void this.cancel(worker, active) }
    signal?.addEventListener('abort', stop, { once: true })
    try {
      worker.handle.agent.followup(createUserMessage({ content: [{ type: 'text', text: prompt }], source: { kind: 'reviewer-runtime', runId: active.id } }) as never)
      await worker.handle.agent.whenIdle()
      if (!active.settled) throw new Error('DSH reviewer turn completed without complete_review')
      const completion = await active.completion
      const result: RunResponse = { worker_id: worker.id, run_id: active.id, completion, replayed: false }
      worker.results.set(active.id, result)
      return result
    } finally {
      signal?.removeEventListener('abort', stop)
      if (worker.active === active) worker.active = undefined
    }
  }

  /** Dispose an idle reviewer worker; repeated releases are harmless. */
  async release(workerId: string): Promise<ReleaseResponse> {
    const worker = this.workers.get(workerId)
    if (worker === undefined || worker.released) return { worker_id: workerId, released: true, replayed: true }
    if (worker.active !== undefined) throw new Error('cannot release reviewer with an active run')
    worker.released = true; this.workers.delete(worker.id)
    for (const operation of worker.operations) this.operations.delete(operation)
    await worker.handle.dispose()
    return { worker_id: workerId, released: true, replayed: false }
  }

  /** Stop active work, await quiescence, and dispose the hidden worker tree. */
  async dispose(): Promise<void> {
    this.stopped = true
    await Promise.all([...this.workers.values()].map(async worker => { if (worker.active !== undefined) await this.cancel(worker, worker.active); await this.release(worker.id) }))
    this.operations.clear()
    if (this.controller !== undefined) { await this.controller.dispose(); this.controller = undefined }
  }

  private async ensureController(workspace: string): Promise<AgentHandle> {
    if (this.controller !== undefined) return this.controller
    if (this.controllerCreating !== undefined) return await this.controllerCreating
    const pending = this.createController(workspace)
    this.controllerCreating = pending
    void pending.then(
      () => { if (this.controllerCreating === pending) this.controllerCreating = undefined },
      () => { if (this.controllerCreating === pending) this.controllerCreating = undefined },
    )
    return await pending
  }
  private async createController(workspace: string): Promise<AgentHandle> {
    const options = this.resolveAgentOptions()
    this.controller = await this.ctx.agents.create({ sessionId: randomUUID() as never, meta: { cwd: workspace }, ...(options === undefined ? {} : { agentOptions: options }) })
    return this.controller
  }
  private resolveAgentOptions(): AgentOptions | undefined { return this.options ?? this.ctx.get('agentDefaultModel')?.currentSelection() }
  private async readinessError(): Promise<string | undefined> {
    if (this.configurationError !== undefined) return this.configurationError
    try { await this.profile; return undefined } catch (error: unknown) { return `read reviewer profile: ${String(error)}` }
  }
  private requireReady(): void { if (this.stopped) throw new Error('reviewer runtime is stopped'); if (this.configurationError !== undefined) throw new Error(this.configurationError) }
  private requireWorker(id: string): ReviewerWorker { const worker = this.workers.get(id); if (worker === undefined || worker.released) throw new Error('reviewer worker is no longer active'); return worker }
  private async acceptCompletion(workerId: string, value: unknown): Promise<{ accepted: boolean }> {
    const worker = this.requireWorker(workerId)
    const active = worker.active
    if (active === undefined) throw new Error('complete_review is no longer active')
    const completion = validateCompletion(value)
    if (active.settled) throw new Error('complete_review was already accepted for this run')
    active.settled = true; active.resolve(completion)
    return { accepted: true }
  }
  private async cancel(worker: ReviewerWorker, active: ActiveRun): Promise<void> {
    if (worker.active !== active) return
    worker.handle.agent.cancel({ kind: 'user' })
    await worker.handle.agent.whenIdle()
    if (!active.settled) { active.settled = true; active.reject(new Error('reviewer run canceled')) }
    if (worker.active === active) worker.active = undefined
  }
}

/** Route the private runtime protocol and reject browser/LAN callers before parsing JSON. */
export function reviewerRuntimeHandler(runtime: ReviewerRuntime): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    if (!isLoopbackAddress(request.socket.remoteAddress)) { respond(response, 403, { error: 'reviewer runtime is loopback-only' }); return }
    if (request.method !== 'POST') { response.writeHead(405, { allow: 'POST' }); response.end(); return }
    try {
      const body = await requestBody(request)
      const action = requiredText(body, 'action')
      if (action === 'status') respond(response, 200, await runtime.status())
      else if (action === 'acquire') respond(response, 200, await runtime.acquire(requiredText(body, 'operation_id'), requiredText(body, 'workspace')))
      else if (action === 'run') {
        const disconnect = observeClientDisconnect(request, response)
        try { respond(response, 200, await runtime.run(requiredText(body, 'worker_id'), requiredText(body, 'run_id'), requiredText(body, 'prompt'), disconnect.signal)) } finally { disconnect.dispose() }
      } else if (action === 'release') respond(response, 200, await runtime.release(requiredText(body, 'worker_id')))
      else respond(response, 400, { error: 'unknown reviewer runtime action' })
    } catch (error: unknown) { respond(response, 409, { error: error instanceof Error ? error.message : String(error) }) }
  }
}

/** Loopback includes IPv4-mapped and IPv6 localhost forms emitted by Node. */
export function isLoopbackAddress(address: string | undefined): boolean { return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1' }

/** Abort a running local request only when its peer disconnects before the response ends. */
export function observeClientDisconnect(request: IncomingMessage, response: ServerResponse): { readonly signal: AbortSignal; dispose(): void } {
  const controller = new AbortController()
  const abort = (): void => { if (!response.writableEnded) controller.abort() }
  request.once('aborted', abort)
  response.once('close', abort)
  return { signal: controller.signal, dispose: () => { request.off('aborted', abort); response.off('close', abort) } }
}

function deferred(id: string): ActiveRun {
  let resolve!: (value: ReviewCompletion) => void; let reject!: (error: Error) => void
  const completion = new Promise<ReviewCompletion>((accept, fail) => { resolve = accept; reject = fail })
  return { id, completion, result: undefined, resolve, reject, settled: false }
}
function record(value: unknown): Record<string, unknown> | undefined { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function requiredText(value: Record<string, unknown>, key: string): string { const text = value[key]; if (typeof text !== 'string' || text.trim() === '') throw new Error(`${key} is required`); return text }
function optionalText<K extends 'notes' | 'evidence'>(key: K, value: unknown): Partial<Record<K, string>> { return typeof value === 'string' ? { [key]: value } as Record<K, string> : {} }
function optionalFindings(value: unknown): readonly ReviewFinding[] {
  if (value === undefined) return []; if (!Array.isArray(value)) throw new Error('new_findings must be an array')
  return value.map((entry) => { const finding = record(entry); if (finding === undefined || typeof finding.summary !== 'string' || finding.summary.trim() === '' || !['blocking_bug', 'acceptance_gap', 'test_weakness', 'follow_up_candidate'].includes(String(finding.category))) throw new Error('new_findings contains an invalid finding'); rejectUnexpectedKeys(finding, ['category', 'summary', 'notes', 'file_references', 'test_commands'], 'new_findings'); return { category: finding.category as ReviewFinding['category'], summary: finding.summary, ...optionalText('notes', finding.notes), ...optionalStringArray('file_references', finding.file_references), ...optionalStringArray('test_commands', finding.test_commands) } })
}
function optionalResolutions(value: unknown): readonly PriorFindingResolution[] {
  if (value === undefined) return []; if (!Array.isArray(value)) throw new Error('prior_finding_resolutions must be an array')
  return value.map((entry) => { const resolution = record(entry); if (resolution === undefined || !Number.isInteger(resolution.finding_id) || typeof resolution.verification_note !== 'string' || !['verified_fixed', 'not_fixed', 'superseded', 'split_to_follow_up'].includes(String(resolution.status))) throw new Error('prior_finding_resolutions contains an invalid resolution'); rejectUnexpectedKeys(resolution, ['finding_id', 'status', 'verification_note'], 'prior_finding_resolutions'); return { finding_id: resolution.finding_id as number, status: resolution.status as PriorFindingResolution['status'], verification_note: resolution.verification_note } })
}
function optionalStringArray<K extends 'file_references' | 'test_commands'>(key: K, value: unknown): Partial<Record<K, readonly string[]>> { if (value === undefined) return {}; if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) throw new Error(`${key} must be an array of strings`); return { [key]: value } as unknown as Record<K, readonly string[]> }
function rejectUnexpectedKeys(value: Record<string, unknown>, allowed: readonly string[], label: string): void { if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error(`${label} contains an unexpected field`) }
async function requestBody(request: IncomingMessage): Promise<Record<string, unknown>> { const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)); const value = record(JSON.parse(Buffer.concat(chunks).toString('utf8'))); if (value === undefined) throw new Error('reviewer runtime request must be a JSON object'); return value }
function respond(response: ServerResponse, status: number, body: unknown): void { response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); response.end(JSON.stringify(body)) }
