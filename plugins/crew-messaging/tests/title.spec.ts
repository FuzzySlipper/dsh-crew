import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { foldSessionTitle } from '@deepseek-ai/dsh-session-title'
import { explicitUserTitle } from '../src/index.ts'

const title = (value: string, source: 'fallback' | 'user'): SessionEvent => ({
  type: 'session/title',
  seq: 0,
  time: 0,
  data: { title: value, messageSeqs: [], source: { kind: source } },
} as unknown as SessionEvent)

describe('explicitUserTitle', () => {
  it('uses only the latest durable user rename, never an automatic title', () => {
    expect(explicitUserTitle([title('Alpha', 'user'), title('automatic', 'fallback')])).toBeUndefined()
    expect(explicitUserTitle([title('automatic', 'fallback'), title('Bravo', 'user')])).toBe('Bravo')
  })

  it('preserves DSH fold behavior for a whitespace event instead of normalizing another title form', () => {
    const events = [title('   ', 'user')]
    expect(explicitUserTitle(events)).toBe(foldSessionTitle(events)?.title)
  })
})
