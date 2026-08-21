import { describe, expect, it } from 'vitest'
import { effectiveBindings } from '../src/addressing.ts'

describe('effectiveBindings', () => {
  it('omits case-insensitive duplicate user titles instead of choosing one root', () => {
    const result = effectiveBindings([], [
      { address: 'Beta', sessionId: 's1' },
      { address: 'beta', sessionId: 's2' },
      { address: 'Gamma', sessionId: 's3' },
    ])
    expect(result.dynamic).toEqual([{ address: 'Gamma', sessionId: 's3' }])
  })

  it('keeps configured bindings authoritative over both a matching alias and session', () => {
    const result = effectiveBindings([{ address: 'Alpha', sessionId: 'configured' }], [
      { address: 'alpha', sessionId: 'discovered-alias' },
      { address: 'Bravo', sessionId: 'configured' },
      { address: 'Charlie', sessionId: 'dynamic' },
    ])
    expect(result.all).toEqual([
      { address: 'Alpha', sessionId: 'configured' },
      { address: 'Charlie', sessionId: 'dynamic' },
    ])
  })
})
