import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { CREW_REVIEW_RECENT_LIMIT, crewReviewAffinityHandler, crewReviewDashboardHandler, crewReviewDashboardSnapshot } from '../src/dashboard/review.ts'

describe('Crew review dashboard host projection', () => {
  it('projects bounded pool facts and strips private worker and Den details', async () => {
    const calls: URL[] = []
    const snapshot = await crewReviewDashboardSnapshot({
      reviewUrl: 'http://127.0.0.1:8413',
      request: async url => {
        calls.push(url)
        if (url.pathname === '/healthz') return json({ status: 'ok', runtime: 'private' })
        return json({
          backend: 'codex', capacity: 2, queued: 1, running: 1, finalizing: 1,
          active: [{ id: 'active-1', key: { project_id: 'dsh-crew', task_id: 7417, review_round_id: 99, correlation_id: 'private' }, state: 'finalizing', created_at: 'now', updated_at: 'now', worker_thread_id: 'private' }],
          recent: Array.from({ length: CREW_REVIEW_RECENT_LIMIT + 1 }, (_, index) => ({
            id: `job-${String(index)}`,
            key: { project_id: 'dsh-crew', task_id: 7417, review_round_id: index + 1, correlation_id: 'private' },
            state: 'succeeded', receipt: { verdict: index % 2 === 0 ? 'looks_good' : 'changes_requested', findings: [{ summary: 'stay in Den' }], thread_id: 'private' },
            created_at: `2026-08-20T00:00:${String(index).padStart(2, '0')}Z`, updated_at: `2026-08-20T00:01:${String(index).padStart(2, '0')}Z`, worker_thread_id: 'private',
          })),
          retained_affinities: [{ project_id: 'dsh-crew', task_id: 7417, expires_at: '2026-08-20T12:00:00Z', worker: 'private' }],
        })
      },
    })
    expect(calls.map(url => url.pathname)).toEqual(['/healthz', '/v1/review-pool'])
    expect(calls.find(url => url.pathname === '/v1/review-pool')?.search).toBe(`?limit=${String(CREW_REVIEW_RECENT_LIMIT)}`)
    expect(snapshot.recent).toHaveLength(CREW_REVIEW_RECENT_LIMIT)
    expect(snapshot.recent[0]).toMatchObject({ id: 'job-0', reviewRoundId: 1, verdict: 'looks_good' })
    expect(snapshot.active).toEqual([expect.objectContaining({ id: 'active-1', state: 'finalizing' })])
    expect(snapshot.finalizing).toBe(1)
    expect(snapshot.failures).toEqual([])
    expect(snapshot.affinities).toEqual([{ projectId: 'dsh-crew', taskId: 7417, expiresAt: '2026-08-20T12:00:00Z' }])
    expect(JSON.stringify(snapshot)).not.toContain('private')
    expect(JSON.stringify(snapshot)).not.toContain('findings')
  })

  it('projects actionable failure rows and rejects malformed pool responses', async () => {
    const request = async (url: URL): Promise<Response> => url.pathname === '/healthz'
      ? json({ status: 'ok' })
      : json({ backend: 'codex', capacity: 2, queued: 0, running: 0, recent: [{ id: 'job-1', key: { project_id: 'p', task_id: 1, review_round_id: 2 }, state: 'failed', failure: 'profile missing', created_at: 'now', updated_at: 'now' }], retained_affinities: [] })
    await expect(crewReviewDashboardSnapshot({ reviewUrl: 'http://127.0.0.1:8413', request })).resolves.toMatchObject({ failures: [{ id: 'job-1', failure: 'profile missing' }] })
    await expect(crewReviewDashboardSnapshot({ reviewUrl: 'http://127.0.0.1:8413', request: async url => url.pathname === '/healthz' ? json({ status: 'ok' }) : json({ backend: 'codex' }) })).rejects.toThrow('invalid review pool response')
  })

  it('clears historical failures after a newer round becomes active or succeeds', async () => {
    const pool = (newest: Record<string, unknown>): Record<string, unknown> => ({
      backend: 'codex', capacity: 2, queued: 0, running: 0, finalizing: 0,
      active: newest.state === 'running' ? [newest] : [],
      recent: [
        ...(newest.state === 'running' ? [] : [newest]),
        { id: 'failed-old', key: { project_id: 'p', task_id: 1, review_round_id: 2 }, state: 'failed', failure: 'old failure', created_at: 'before', updated_at: 'before' },
        { id: 'stale', key: { project_id: 'q', task_id: 2, review_round_id: 7 }, state: 'stale', failure: 'superseded', created_at: 'before', updated_at: 'now' },
      ], retained_affinities: [],
    })
    for (const newest of [
      { id: 'active-new', key: { project_id: 'p', task_id: 1, review_round_id: 3 }, state: 'running', created_at: 'now', updated_at: 'now' },
      { id: 'success-new', key: { project_id: 'p', task_id: 1, review_round_id: 3 }, state: 'succeeded', created_at: 'now', updated_at: 'now' },
    ]) {
      const snapshot = await crewReviewDashboardSnapshot({ reviewUrl: 'http://127.0.0.1:8413', request: async url => url.pathname === '/healthz' ? json({ status: 'ok' }) : json(pool(newest)) })
      expect(snapshot.failures).toEqual([])
    }
  })

  it('keeps the projection GET-only and maps service outages to 503', async () => {
    const writes: unknown[][] = []
    const response = { writeHead: (...args: unknown[]) => { writes.push(args) }, end: () => {} }
    await crewReviewDashboardHandler({ reviewUrl: 'http://127.0.0.1:8413', request: async () => new Response('down', { status: 503 }) })(
      { method: 'POST' } as IncomingMessage, response as unknown as ServerResponse,
    )
    expect(writes).toEqual([[405, { allow: 'GET' }]])
    writes.length = 0
    await crewReviewDashboardHandler({ reviewUrl: 'http://127.0.0.1:8413', request: async () => new Response('down', { status: 503 }) })(
      { method: 'GET' } as IncomingMessage, response as unknown as ServerResponse,
    )
    expect(writes[0]?.[0]).toBe(503)
  })

  it('releases only a validated logical task affinity through the control route', async () => {
    const calls: Array<{ url: URL; init: RequestInit | undefined }> = []
    const request = async (url: URL, init?: RequestInit): Promise<Response> => { calls.push({ url, init }); return json({ released: true }) }
    const writes: unknown[][] = []
    const response = { writeHead: (...args: unknown[]) => { writes.push(args) }, end: () => {} }
    const handler = crewReviewAffinityHandler({ reviewUrl: 'http://127.0.0.1:8413', request })
    await handler({ method: 'DELETE', url: '/plugins/dsh-crew-messaging/review-affinity?project=team%2Falpha&task=7417' } as IncomingMessage, response as unknown as ServerResponse)
    expect(calls[0]?.url.pathname).toBe('/v1/review-affinities/team%2Falpha/7417')
    expect(calls[0]?.init?.method).toBe('DELETE')
    expect(writes[0]?.[0]).toBe(200)
    writes.length = 0
    await handler({ method: 'DELETE', url: '/plugins/dsh-crew-messaging/review-affinity?project=p&task=0' } as IncomingMessage, response as unknown as ServerResponse)
    expect(calls).toHaveLength(1)
    expect(writes[0]).toEqual([400, expect.anything()])
  })
})

function json(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }) }
