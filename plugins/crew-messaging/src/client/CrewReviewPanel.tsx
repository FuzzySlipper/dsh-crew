/** Browser panel for the private Crew review worker pool. */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CrewReviewAffinitySummary, CrewReviewDashboardSnapshot, CrewReviewJobSummary } from '../dashboard/types.ts'
import css from './CrewCockpit.styles.ts'

export const CREW_REVIEW_DASHBOARD_ENDPOINT = '/plugins/dsh-crew-messaging/review-pool'
export const CREW_REVIEW_AFFINITY_ENDPOINT = '/plugins/dsh-crew-messaging/review-affinity'
const POLL_MS = 5_000

type ReviewState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly snapshot: CrewReviewDashboardSnapshot; readonly refreshedAt: string }
  | { readonly kind: 'error'; readonly message: string }

/** Decode only the plugin-owned review projection and discard unknown fields. */
export function decodeCrewReviewDashboard(value: unknown): CrewReviewDashboardSnapshot | undefined {
  if (!isObject(value) || !isObject(value.health) || typeof value.backend !== 'string'
    || !nonNegativeInteger(value.capacity) || !nonNegativeInteger(value.queued) || !nonNegativeInteger(value.running)
    || !nonNegativeInteger(value.finalizing)
    || typeof value.health.ready !== 'boolean' || typeof value.health.status !== 'string'
    || !Array.isArray(value.active) || !Array.isArray(value.recent) || !Array.isArray(value.affinities) || !Array.isArray(value.failures)) return undefined
  const active = value.active.flatMap(reviewJob)
  const recent = value.recent.flatMap(reviewJob)
  const affinities = value.affinities.flatMap(reviewAffinity)
  const failures = value.failures.flatMap(reviewJob)
  if (active.length !== value.active.length || recent.length !== value.recent.length || affinities.length !== value.affinities.length || failures.length !== value.failures.length) return undefined
  return {
    health: { ready: value.health.ready, status: value.health.status },
    backend: value.backend,
    capacity: value.capacity,
    queued: value.queued,
    running: value.running,
    finalizing: value.finalizing,
    active,
    recent,
    affinities,
    failures,
  }
}

/** Render pool health, bounded review evidence, and the idle-affinity release control. */
export function CrewReviewPanel(): ReactNode {
  const [state, setState] = useState<ReviewState>({ kind: 'loading' })
  const [refresh, setRefresh] = useState(0)
  const [releasing, setReleasing] = useState<string | undefined>()
  const [actionError, setActionError] = useState<string | undefined>()

  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(CREW_REVIEW_DASHBOARD_ENDPOINT, { cache: 'no-store' })
        if (!response.ok) throw new Error(`request failed (${String(response.status)})`)
        const snapshot = decodeCrewReviewDashboard(await response.json())
        if (snapshot === undefined) throw new Error('received an invalid review pool response')
        if (active) setState({ kind: 'ready', snapshot, refreshedAt: new Date().toLocaleTimeString() })
      } catch (error: unknown) {
        if (active) setState({ kind: 'error', message: error instanceof Error ? error.message : 'request failed' })
      }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, POLL_MS)
    return () => { active = false; window.clearInterval(timer) }
  }, [refresh])

  const release = async (affinity: CrewReviewAffinitySummary): Promise<void> => {
    const key = `${affinity.projectId}:${String(affinity.taskId)}`
    setReleasing(key)
    setActionError(undefined)
    try {
      const url = new URL(CREW_REVIEW_AFFINITY_ENDPOINT, window.location.href)
      url.searchParams.set('project', affinity.projectId)
      url.searchParams.set('task', String(affinity.taskId))
      const response = await fetch(url, { method: 'DELETE', cache: 'no-store' })
      if (!response.ok) {
        const value = await response.json().catch(() => undefined)
        throw new Error(isObject(value) && typeof value.error === 'string' ? value.error : `release failed (${String(response.status)})`)
      }
      setRefresh(value => value + 1)
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'release failed')
    } finally {
      setReleasing(undefined)
    }
  }

  if (state.kind === 'loading') return <section className={css.panel} data-crew-review><h3>Crew review pool</h3><p className={css.empty}>Loading review service…</p></section>
  if (state.kind === 'error') return <section className={css.panel} data-crew-review><div className={css.reviewHeader}><h3>Crew review pool</h3><button type="button" className={css.secondary} onClick={() => { setRefresh(value => value + 1) }}>Refresh</button></div><p className={css.error}>Crew review service is unavailable: {state.message}</p></section>

  const snapshot = state.snapshot
  return <section className={css.panel} data-crew-review>
    <div className={css.reviewHeader}><div><h3>Crew review pool</h3><p className={css.reviewDescription}>Private reviewer workers and recent Den review outcomes. Findings stay in Den. Last refreshed {state.refreshedAt}.</p></div><button type="button" className={css.secondary} onClick={() => { setRefresh(value => value + 1) }}>Refresh status</button></div>
    <div className={css.reviewStatus}>
      <Status label="Service" value={snapshot.health.ready ? snapshot.health.status : 'unavailable'} good={snapshot.health.ready} />
      <Status label="Backend" value={snapshot.backend} good={snapshot.backend !== 'unavailable'} />
      <Status label="Running jobs" value={`${String(snapshot.running)} / ${String(snapshot.capacity)}`} good={snapshot.running <= snapshot.capacity} />
      <Status label="Finalizing" value={String(snapshot.finalizing)} good={snapshot.finalizing === 0} />
      <Status label="Queued" value={String(snapshot.queued)} good={snapshot.queued === 0} />
    </div>
    {snapshot.failures.length > 0 ? <ReviewFailures failures={snapshot.failures} /> : <p className={css.empty}>No unresolved review failures.</p>}
    <ReviewJobs title="Active jobs" empty="No active review jobs." jobs={snapshot.active} />
    <ReviewJobs jobs={snapshot.recent} />
    <section className={css.reviewAffinities}><h4>Retained reviewers</h4>{snapshot.affinities.length === 0 ? <p className={css.empty}>No idle task affinities.</p> : <div className={css.reviewAffinityRows}>{snapshot.affinities.map(affinity => {
      const key = `${affinity.projectId}:${String(affinity.taskId)}`
      return <div className={css.reviewAffinityRow} key={key}><span><strong>{affinity.projectId} / task {String(affinity.taskId)}</strong><small>expires {affinity.expiresAt}</small></span><button type="button" className={css.secondary} disabled={releasing !== undefined} onClick={() => { void release(affinity) }}>{releasing === key ? 'Releasing…' : 'Release'}</button></div>
    })}</div>}{actionError === undefined ? null : <p className={css.error}>{actionError}</p>}</section>
  </section>
}

function ReviewJobs({ jobs, title = 'Recent verdicts', empty = 'No completed review jobs.' }: { readonly jobs: readonly CrewReviewJobSummary[]; readonly title?: string; readonly empty?: string }): ReactNode {
  return <section className={css.reviewJobs}><h4>{title}</h4>{jobs.length === 0 ? <p className={css.empty}>{empty}</p> : <div className={css.reviewJobRows}>{jobs.map(job => <article className={css.reviewJobRow} key={job.id}><div><strong>{job.projectId} / task {String(job.taskId)}</strong><span className={job.verdict === 'looks_good' ? css.good : job.verdict === 'changes_requested' ? css.warning : ''}>{job.verdict ?? job.state}</span></div><small>round {String(job.reviewRoundId)} · {job.updatedAt}</small>{job.failure === undefined ? null : <p className={css.error}>{job.failure}</p>}</article>)}</div>}</section>
}

function ReviewFailures({ failures }: { readonly failures: readonly CrewReviewJobSummary[] }): ReactNode {
  return <section className={css.reviewFailures}><h4>Action needed</h4><div className={css.reviewJobRows}>{failures.map(job => <article className={css.reviewJobRow} key={`failure-${job.id}`}><div><strong>{job.projectId} / task {String(job.taskId)}</strong><span className={css.error}>{job.state}</span></div><p className={css.error}>{job.failure ?? 'Review job failed'}</p><small>round {String(job.reviewRoundId)} · {job.updatedAt}</small></article>)}</div></section>
}

function Status({ label, value, good }: { readonly label: string; readonly value: string; readonly good: boolean }): ReactNode { return <div><span>{label}</span><strong className={good ? css.good : css.warning}>{value}</strong></div> }
function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function nonNegativeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
function positiveInteger(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 }
function reviewJob(value: unknown): CrewReviewJobSummary[] {
  if (!isObject(value) || typeof value.id !== 'string' || typeof value.projectId !== 'string' || !positiveInteger(value.taskId) || !positiveInteger(value.reviewRoundId) || typeof value.state !== 'string' || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') return []
  const verdict = typeof value.verdict === 'string' ? value.verdict : undefined
  const failure = typeof value.failure === 'string' && value.failure !== '' ? value.failure : undefined
  return [{ id: value.id, projectId: value.projectId, taskId: value.taskId, reviewRoundId: value.reviewRoundId, state: value.state, ...(verdict === undefined ? {} : { verdict }), ...(failure === undefined ? {} : { failure }), createdAt: value.createdAt, updatedAt: value.updatedAt }]
}
function reviewAffinity(value: unknown): CrewReviewAffinitySummary[] { return isObject(value) && typeof value.projectId === 'string' && positiveInteger(value.taskId) && typeof value.expiresAt === 'string' ? [{ projectId: value.projectId, taskId: value.taskId, expiresAt: value.expiresAt }] : [] }
