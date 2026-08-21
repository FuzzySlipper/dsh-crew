import { describe, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { acceptedMessages } from '../src/index.ts'

const relay = { id: 'relay', text: 'relay', source: { kind: 'crew-messaging', messageId: 'm1', deliveryId: 'd1', senderAddress: 'alpha', recipientAddress: 'beta', form: 'relay' as const } }
const context = { id: 'context', text: 'context', source: { kind: 'plugin', plugin: 'test' } }

describe('acceptedMessages', () => {
  it('replays next-turn and next-step splices in independent coordinate spaces', () => {
    const events = [
      { type: 'agent/inbox/spliced', data: { target: 'next-turn', start: 0, inserted: [relay] } },
      { type: 'agent/inbox/spliced', data: { target: 'next-step', start: 0, inserted: [context] } },
      { type: 'agent/inbox/spliced', data: { target: 'next-step', start: 0, removedCount: 1, inserted: [] } },
    ]
    expect(acceptedMessages(events as never)).toContainEqual(relay)
  })
  it('uses the root registry rather than a generic live-agent lookup for bound targets', async () => {
    const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
    const tools = await readFile(new URL('../src/tools.ts', import.meta.url), 'utf8')
    expect(source).toContain("this.ctx.agents.roots().find(agent => agent.id === sessionId as SessionId)")
    expect(tools).toContain("!ctx.agents.roots().includes(agent)")
  })
})
