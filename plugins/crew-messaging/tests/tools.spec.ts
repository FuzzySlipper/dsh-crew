import { describe, expect, it } from 'vitest'
import { synchronizeScopedTools } from '../src/tools.ts'

describe('synchronizeScopedTools', () => {
  it('adds tools after discovery, retains them on rename, and removes both collision losers', () => {
    const alpha = { id: 'alpha' }; const beta = { id: 'beta' }
    const installed = new Map<typeof alpha, () => void>()
    const addresses = new Set<string>()
    const disposed: string[] = []
    const install = (agent: typeof alpha): void => {
      if (installed.has(agent)) return
      installed.set(agent, () => { disposed.push(agent.id) })
    }
    const sync = (): void => synchronizeScopedTools([alpha, beta], installed, agent => addresses.has(agent.id), install)

    sync()
    expect(installed.size).toBe(0)
    addresses.add('alpha')
    sync()
    expect([...installed.keys()]).toEqual([alpha])
    sync()
    expect(disposed).toEqual([])
    addresses.clear()
    sync()
    expect(installed.size).toBe(0)
    expect(disposed).toEqual(['alpha'])
    addresses.add('alpha'); addresses.add('beta')
    sync()
    expect(installed.size).toBe(2)
    addresses.clear()
    sync()
    expect(installed.size).toBe(0)
    expect(disposed).toEqual(['alpha', 'alpha', 'beta'])
  })
})
