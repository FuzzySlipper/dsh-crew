import { describe, expect, it } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { decodeCrewDashboard } from '../src/client/CrewCockpit.tsx'
import { decodeCrewReviewDashboard } from '../src/client/CrewReviewPanel.tsx'

const snapshot = {
  fabric: { ready: true, status: 'ok' },
  adapter: { initialized: true, stopped: false, connected: true },
  directory: [], messages: [], deliveries: [],
  tuning: { leaseDuration: '2m', renewMs: 45_000, pollMs: 1_000, claimDuration: '45s', ttl: '24h', acceptanceTimeoutMs: 1_000, acceptancePollMs: 10 },
}

describe('Crew cockpit client', () => {
  it('accepts the bounded review projection without exposing worker or finding data', () => {
    const review = {
      health: { ready: true, status: 'ok' }, backend: 'codex', capacity: 2, queued: 1, running: 1,
      recent: [{ id: 'job-1', projectId: 'dsh-crew', taskId: 7417, reviewRoundId: 2, state: 'succeeded', verdict: 'looks_good', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:01:00Z', correlationId: 'secret-correlation', findings: [{ summary: 'must stay in Den' }], threadId: 'must-not-leak' }],
      affinities: [{ projectId: 'dsh-crew', taskId: 7417, expiresAt: '2026-08-20T12:00:00Z', threadId: 'must-not-leak' }],
      failures: [{ id: 'job-2', projectId: 'dsh-crew', taskId: 7417, reviewRoundId: 3, state: 'failed', failure: 'profile missing', createdAt: '2026-08-20T01:00:00Z', updatedAt: '2026-08-20T01:01:00Z', threadId: 'must-not-leak' }],
    }
    expect(decodeCrewReviewDashboard(review)).toEqual({
      health: { ready: true, status: 'ok' }, backend: 'codex', capacity: 2, queued: 1, running: 1,
      recent: [{ id: 'job-1', projectId: 'dsh-crew', taskId: 7417, reviewRoundId: 2, state: 'succeeded', verdict: 'looks_good', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:01:00Z' }],
      affinities: [{ projectId: 'dsh-crew', taskId: 7417, expiresAt: '2026-08-20T12:00:00Z' }],
      failures: [{ id: 'job-2', projectId: 'dsh-crew', taskId: 7417, reviewRoundId: 3, state: 'failed', failure: 'profile missing', createdAt: '2026-08-20T01:00:00Z', updatedAt: '2026-08-20T01:01:00Z' }],
    })
    expect(JSON.stringify(decodeCrewReviewDashboard(review))).not.toContain('must-not-leak')
    expect(decodeCrewReviewDashboard({ ...review, recent: [{ ...review.recent[0], taskId: 0 }] })).toBeUndefined()
  })
  it('accepts only complete read-only snapshots', () => {
    expect(decodeCrewDashboard(snapshot)).toMatchObject(snapshot)
    const decoded = decodeCrewDashboard({ ...snapshot, directory: [{ address: 'A', status: 'routable', source: 'session-title', sessionId: 'hidden' }] })
    expect(decoded).toBeDefined()
    expect(decoded).not.toHaveProperty('directory.0.sessionId')
    expect(decodeCrewDashboard({ ...snapshot, deliveries: [{ id: 'd', messageId: 'm', recipient: 'B' }] })).toBeUndefined()
  })

  it('registers and disposes the global Settings section through the slot convention', () => {
    let registration: { readonly id: string; readonly order: number; readonly label: string } | undefined
    const injected = new Map<string, () => void>()
    const dispose = () => { registration = undefined }
    apply({ slots: {
      inject: (name, callback) => { injected.set(name, callback) },
      register: (options) => { registration = options; return dispose },
    }, logger: { warn: () => {} }, effect: effect => { void effect() } })
    expect(inject).toEqual(['slots'])
    expect(injected.get('settings.section')).toBeTypeOf('function')
    const disposer = injected.get('settings.section')!()
    expect(registration).toEqual({ name: 'settings.section', id: 'crew-messaging', order: 35, label: 'Crew' })
    disposer()
    expect(registration).toBeUndefined()
  })

  it('keeps the cockpit and adds independent footer and overlay registrations', () => {
    const injected = new Map<string, () => void>()
    const registrations: Array<{ readonly name: string; readonly id: string }> = []
    apply({ slots: {
      inject: (name, callback) => { injected.set(name, callback) },
      register: options => { registrations.push(options); return () => {} },
    }, logger: { warn: () => {} }, effect: effect => { void effect() } })
    injected.get('settings.section')!()
    injected.get('sidebar.footer.action')!()
    injected.get('shell.overlay')!()
    expect(registrations.map(({ name, id }) => ({ name, id }))).toEqual([
      { name: 'settings.section', id: 'crew-messaging' },
      { name: 'sidebar.footer.action', id: 'crew-messaging-sessions' },
      { name: 'shell.overlay', id: 'crew-messaging-sessions' },
    ])
  })
})
