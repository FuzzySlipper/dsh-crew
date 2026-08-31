/** Host-only projection and control routes for the sibling Crew review pool. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CrewReviewAffinitySummary, CrewReviewDashboardSnapshot, CrewReviewHealth, CrewReviewJobSummary, CrewReviewRetryResponse } from './types.ts'

/** Same-origin endpoint served by the DSH plugin for review observations. */
export const CREW_REVIEW_DASHBOARD_PATH = '/plugins/dsh-crew-messaging/review-pool'

/** Same-origin endpoint used only to release one idle retained reviewer. */
export const CREW_REVIEW_AFFINITY_PATH = '/plugins/dsh-crew-messaging/review-affinity'

/** Same-origin endpoint used only to retry one exact failed review job. */
export const CREW_REVIEW_RETRY_PATH = '/plugins/dsh-crew-messaging/review-retry'

/** Keep review readback compact even when the service retains more history. */
export const CREW_REVIEW_RECENT_LIMIT = 20

/** Testable request surface for the trusted-box review service. */
export type ReviewFetch = (input: URL, init?: RequestInit) => Promise<Response>

/** Build the browser-safe pool projection from the review service's two reads. */
export async function crewReviewDashboardSnapshot(input: {
  readonly reviewUrl: string
  readonly request?: ReviewFetch
}): Promise<CrewReviewDashboardSnapshot> {
  const request = input.request ?? fetch
  const [health, pool] = await Promise.all([
    readJson(request, new URL('/healthz', input.reviewUrl)),
    readJson(request, new URL(`/v1/review-pool?limit=${String(CREW_REVIEW_RECENT_LIMIT)}`, input.reviewUrl)),
  ])
  const healthProjection = projectHealth(health)
  const poolProjection = projectPool(pool)
  return {
    health: healthProjection,
    backend: poolProjection.backend,
    capacity: poolProjection.capacity,
    queued: poolProjection.queued,
    running: poolProjection.running,
    finalizing: poolProjection.finalizing,
    active: poolProjection.active,
    recent: poolProjection.recent,
    affinities: poolProjection.affinities,
    failures: unresolvedFailures([...poolProjection.active, ...poolProjection.recent]),
  }
}

function unresolvedFailures(jobs: readonly CrewReviewJobSummary[]): readonly CrewReviewJobSummary[] {
  const newest = new Map<string, CrewReviewJobSummary>()
  for (const job of jobs) {
    const key = `${job.projectId}\u0000${String(job.taskId)}`
    const current = newest.get(key)
    if (current === undefined || job.reviewRoundId > current.reviewRoundId) newest.set(key, job)
  }
  return [...newest.values()].filter(job => job.state === 'failed' && job.failure !== undefined)
}

/** Serve the review projection without forwarding service-private fields. */
export function crewReviewDashboardHandler(input: {
  readonly reviewUrl: string
  readonly request?: ReviewFetch
}): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' })
      response.end()
      return
    }
    try {
      const snapshot = await crewReviewDashboardSnapshot(input)
      write(response, 200, snapshot)
    } catch {
      write(response, 503, { error: 'Crew review service is unavailable' })
    }
  }
}

/** Release an idle logical task affinity through the plugin-owned route. */
export function crewReviewAffinityHandler(input: {
  readonly reviewUrl: string
  readonly request?: ReviewFetch
}): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    if (request.method !== 'DELETE') {
      response.writeHead(405, { allow: 'DELETE' })
      response.end()
      return
    }
    const query = new URL(request.url ?? '/', 'http://localhost').searchParams
    const projectId = query.get('project')?.trim()
    const taskText = query.get('task')?.trim()
    if (projectId === undefined || projectId === '' || taskText === undefined || taskText === '') {
      write(response, 400, { error: 'project and task are required' })
      return
    }
    if (!/^\d+$/.test(taskText) || Number(taskText) <= 0 || !Number.isSafeInteger(Number(taskText))) {
      write(response, 400, { error: 'task must be a positive integer' })
      return
    }
    const requestFn = input.request ?? fetch
    try {
      const upstream = await requestFn(
        new URL(`/v1/review-affinities/${encodeURIComponent(projectId)}/${encodeURIComponent(taskText)}`, input.reviewUrl),
        { method: 'DELETE', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5_000) },
      )
      if (!upstream.ok) {
        write(response, upstream.status === 404 || upstream.status === 409 ? upstream.status : 503, { error: await upstreamError(upstream) })
        return
      }
      write(response, 200, { released: true })
    } catch {
      write(response, 503, { error: 'Crew review service is unavailable' })
    }
  }
}

/** Retry one exact failed review job through the plugin-owned route. */
export function crewReviewRetryHandler(input: {
  readonly reviewUrl: string
  readonly request?: ReviewFetch
}): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(405, { allow: 'POST' })
      response.end()
      return
    }
    const query = new URL(request.url ?? '/', 'http://localhost').searchParams
    const values = query.getAll('job_id')
    const jobId = values.length === 1 ? values[0]?.trim() : undefined
    if (jobId === undefined || !safeJobId(jobId)) {
      write(response, 400, { error: 'job_id must be a safe identifier' })
      return
    }
    const requestFn = input.request ?? fetch
    try {
      const upstream = await requestFn(
        new URL(`/v1/review-jobs/${encodeURIComponent(jobId)}/retry`, input.reviewUrl),
        { method: 'POST', headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5_000) },
      )
      if (!upstream.ok) {
        write(response, upstream.status === 404 || upstream.status === 409 ? upstream.status : 503, { error: await upstreamError(upstream) })
        return
      }
      const value = object(await upstream.json())
      const job = object(value?.job)
      const projected = job === undefined ? [] : projectJob(job)
      const result = projected[0]
      if (value?.retried !== true || result === undefined || result.id !== jobId) {
        write(response, 503, { error: 'Crew review service returned an invalid retry response' })
        return
      }
      const safeResult: CrewReviewRetryResponse = { job: result, retried: true }
      write(response, 200, safeResult)
    } catch {
      write(response, 503, { error: 'Crew review service is unavailable' })
    }
  }
}

interface PoolProjection {
  readonly backend: string
  readonly capacity: number
  readonly queued: number
  readonly running: number
  readonly finalizing: number
  readonly active: readonly CrewReviewJobSummary[]
  readonly recent: readonly CrewReviewJobSummary[]
  readonly affinities: readonly CrewReviewAffinitySummary[]
}

async function readJson(request: ReviewFetch, url: URL): Promise<unknown> {
  const response = await request(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5_000) })
  if (!response.ok) throw new Error(`review service response ${String(response.status)}`)
  return await response.json()
}

function projectHealth(value: unknown): CrewReviewHealth {
  const record = object(value)
  const status = text(record?.status)
  if (status === undefined) throw new Error('invalid review health response')
  return { ready: true, status }
}

function projectPool(value: unknown): PoolProjection {
  const record = object(value)
  const backend = text(record?.backend)
  const capacity = nonNegativeInteger(record?.capacity)
  const queued = nonNegativeInteger(record?.queued)
  const running = nonNegativeInteger(record?.running)
  if (backend === undefined || capacity === undefined || queued === undefined || running === undefined) {
    throw new Error('invalid review pool response')
  }
  // Older service builds did not expose finalizing jobs. Retain read
  // compatibility during rolling local upgrades.
  const finalizing = nonNegativeInteger(record?.finalizing) ?? 0
  const active = boundedArray(record?.active, CREW_REVIEW_RECENT_LIMIT).flatMap(projectJob)
  const recent = boundedArray(record?.recent, CREW_REVIEW_RECENT_LIMIT).flatMap(projectJob)
  const affinities = array(record?.retained_affinities).flatMap(projectAffinity)
  return { backend, capacity, queued, running, finalizing, active, recent, affinities }
}

function projectJob(value: Record<string, unknown>): CrewReviewJobSummary[] {
  const key = object(value.key)
  const id = text(value.id)
  const projectId = text(key?.project_id)
  const taskId = positiveInteger(key?.task_id)
  const reviewRoundId = positiveInteger(key?.review_round_id)
  const state = text(value.state)
  const createdAt = text(value.created_at)
  const updatedAt = text(value.updated_at)
  if (id === undefined || projectId === undefined || taskId === undefined || reviewRoundId === undefined || state === undefined || createdAt === undefined || updatedAt === undefined) return []
  const receipt = object(value.receipt)
  const verdict = text(receipt?.verdict)
  const failure = text(value.failure)
  return [{
    id, projectId, taskId, reviewRoundId, state,
    ...(verdict === undefined ? {} : { verdict }),
    ...(failure === undefined || failure === '' ? {} : { failure }),
    createdAt, updatedAt,
  }]
}

function projectAffinity(value: Record<string, unknown>): CrewReviewAffinitySummary[] {
  const projectId = text(value.project_id)
  const taskId = positiveInteger(value.task_id)
  const expiresAt = text(value.expires_at)
  return projectId === undefined || taskId === undefined || expiresAt === undefined ? [] : [{ projectId, taskId, expiresAt }]
}

function boundedArray(value: unknown, limit: number): readonly Record<string, unknown>[] { return array(value).slice(0, limit) }
function array(value: unknown): readonly Record<string, unknown>[] { return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => object(entry) !== undefined) : [] }
function object(value: unknown): Record<string, unknown> | undefined { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined }
function text(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined }
function nonNegativeInteger(value: unknown): number | undefined { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined }
function positiveInteger(value: unknown): number | undefined { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined }
function safeJobId(value: string): boolean { return /^[A-Za-z0-9_-]+$/.test(value) }

async function upstreamError(response: Response): Promise<string> {
  try {
    const value = object(await response.json())
    const error = text(value?.error)
    if (error !== undefined && error !== '') return error
  } catch {
    // The response body is diagnostic only; the status still gives the caller a useful result.
  }
  return `Crew review request failed (${String(response.status)})`
}

function write(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  response.end(JSON.stringify(value))
}
