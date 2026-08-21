import { describe, expect, it } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { decodeCrewDashboard } from '../src/client/CrewCockpit.tsx'

const snapshot = {
  fabric: { ready: true, status: 'ok' },
  adapter: { initialized: true, stopped: false, connected: true },
  directory: [], messages: [], deliveries: [],
  tuning: { leaseDuration: '2m', renewMs: 45_000, pollMs: 1_000, claimDuration: '45s', ttl: '24h', acceptanceTimeoutMs: 1_000, acceptancePollMs: 10 },
}

describe('Crew cockpit client', () => {
  it('accepts only complete read-only snapshots', () => {
    expect(decodeCrewDashboard(snapshot)).toMatchObject(snapshot)
    const decoded = decodeCrewDashboard({ ...snapshot, directory: [{ address: 'A', status: 'routable', source: 'session-title', sessionId: 'hidden' }] })
    expect(decoded).toBeDefined()
    expect(decoded).not.toHaveProperty('directory.0.sessionId')
    expect(decodeCrewDashboard({ ...snapshot, deliveries: [{ id: 'd', messageId: 'm', recipient: 'B' }] })).toBeUndefined()
  })

  it('registers and disposes the global Settings section through the slot convention', () => {
    let registration: { readonly id: string; readonly order: number; readonly label: string } | undefined
    let injected: (() => void) | undefined
    const dispose = () => { registration = undefined }
    apply({ slots: {
      inject: (_name, callback) => { injected = callback },
      register: (options) => { registration = options; return dispose },
    } })
    expect(inject).toEqual(['slots'])
    expect(injected).toBeTypeOf('function')
    const disposer = injected!()
    expect(registration).toEqual({ name: 'settings.section', id: 'crew-messaging', order: 35, label: 'Crew' })
    disposer()
    expect(registration).toBeUndefined()
  })
})
