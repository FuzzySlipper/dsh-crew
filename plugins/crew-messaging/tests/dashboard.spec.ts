import { describe, expect, it } from 'vitest'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { CREW_DASHBOARD_TRAFFIC_LIMIT, crewDashboardHandler, crewDashboardSnapshot, dashboardTuning } from '../src/dashboard/host.ts'

const adapter = {
  directory: () => [{ address: 'alpha', status: 'routable' as const, source: 'session-title' as const }],
  status: () => ({ initialized: true, stopped: false, connected: true, leaseExpiresAt: '2026-08-21T00:00:00Z' }),
}

describe('Crew dashboard host projection', () => {
  it('keeps the settings response bounded and excludes DSH and fabric internals', async () => {
    const calls: URL[] = []
    const snapshot = await crewDashboardSnapshot({
      adapter,
      tuning: dashboardTuning({ pollMs: 500 }),
      fabricUrl: 'http://127.0.0.1:8787',
      request: async (url) => {
        calls.push(url)
        if (url.pathname === '/readyz') return json({ status: 'ok', time: 'ignored' })
        return json({
          messages: Array.from({ length: CREW_DASHBOARD_TRAFFIC_LIMIT + 1 }, (_, index) => ({
            message_id: `message-${String(index)}`, sender_address: 'alpha', recipient_address: 'beta', body: `body-${String(index)}-${'x'.repeat(180)}`,
            created_at: `2026-08-20T00:00:${String(index).padStart(2, '0')}Z`, target_ref: 'must-not-leak', lease_token: 'must-not-leak',
          })),
          deliveries: [{ delivery_id: 'delivery-1', message_id: 'message-1', recipient_address: 'beta', state: 'delivered', native_attempt_ref: 'must-not-leak' }],
        })
      },
    })
    expect(calls.map(url => url.pathname)).toEqual(['/readyz', '/v1/traffic'])
    expect(snapshot.messages).toHaveLength(CREW_DASHBOARD_TRAFFIC_LIMIT)
    expect(snapshot.messages[0]?.id).toBe(`message-${String(CREW_DASHBOARD_TRAFFIC_LIMIT)}`)
    expect(snapshot.messages[0]?.preview).toHaveLength(160)
    expect(snapshot).not.toHaveProperty('target_ref')
    expect(JSON.stringify(snapshot)).not.toContain('must-not-leak')
    expect(snapshot.adapter.leaseExpiresAt).toBe('2026-08-21T00:00:00Z')
    expect(snapshot.tuning.pollMs).toBe(500)
  })

  it('fails the projection when the fabric is unavailable', async () => {
    await expect(crewDashboardSnapshot({
      adapter, tuning: dashboardTuning({}), fabricUrl: 'http://127.0.0.1:8787', request: async () => new Response('no', { status: 503 }),
    })).rejects.toThrow('fabric response 503')
  })

  it('answers only GET requests', async () => {
    const writes: unknown[][] = []
    const response = { writeHead: (...args: unknown[]) => { writes.push(args) }, end: () => {} }
    await crewDashboardHandler({ adapter, tuning: dashboardTuning({}), fabricUrl: 'http://127.0.0.1:8787' })(
      { method: 'POST' } as IncomingMessage, response as unknown as ServerResponse,
    )
    expect(writes).toEqual([[405, { allow: 'GET' }]])
  })
})

function json(value: unknown): Response { return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } }) }
