import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import { ReviewerRuntime, isLoopbackAddress, observeClientDisconnect, validateCompletion } from '../src/reviewer-runtime.ts'

describe('reviewer runtime protocol guards', () => {
  it('accepts only the compact semantic completion forms Den can finalize', () => {
    expect(validateCompletion({ verdict: 'looks_good', notes: 'no current findings' })).toEqual({ verdict: 'looks_good', notes: 'no current findings' })
    expect(validateCompletion({ verdict: 'changes_requested', new_findings: [{ category: 'blocking_bug', summary: 'regression' }] })).toMatchObject({ verdict: 'changes_requested' })
  })

  it('rejects semantically impossible review completions before they leave DSH', () => {
    expect(() => validateCompletion({ verdict: 'looks_good', new_findings: [{ category: 'follow_up_candidate', summary: 'note' }] })).toThrow(/looks_good/)
    expect(() => validateCompletion({ verdict: 'changes_requested' })).toThrow(/requires/)
    expect(() => validateCompletion({ verdict: 'changes_requested', new_findings: [{ category: 'invented', summary: 'bad' }] })).toThrow(/invalid finding/)
    expect(() => validateCompletion({ verdict: 'looks_good', prior_finding_resolutions: [{ finding_id: 1, status: 'invented', verification_note: 'bad' }] })).toThrow(/invalid resolution/)
    expect(() => validateCompletion({ verdict: 'looks_good', invented: true })).toThrow(/unexpected field/)
  })

  it('recognizes only Node localhost socket addresses', () => {
    expect(isLoopbackAddress('127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('::1')).toBe(true)
    expect(isLoopbackAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isLoopbackAddress('192.168.1.10')).toBe(false)
    expect(isLoopbackAddress(undefined)).toBe(false)
  })

  it('coalesces concurrent acquisitions before capacity checks and creates one controller', async () => {
    const fake = fakeDsh()
    const runtime = new ReviewerRuntime(fake.ctx as never, { reviewerProfilePath: '/dev/null', reviewerCapacity: 2 })
    const [first, second] = await Promise.all([runtime.acquire('operation-a', '/workspace/a'), runtime.acquire('operation-b', '/workspace/b')])
    expect(fake.creates).toBe(3)
    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(false)
    await runtime.dispose()
  })

  it('coalesces the same operation and replays its one worker reservation', async () => {
    const fake = fakeDsh()
    const runtime = new ReviewerRuntime(fake.ctx as never, { reviewerProfilePath: '/dev/null', reviewerCapacity: 1 })
    const [first, second] = await Promise.all([runtime.acquire('operation-a', '/workspace/a'), runtime.acquire('operation-a', '/workspace/a')])
    expect(first.worker_id).toBe(second.worker_id)
    expect(fake.creates).toBe(2)
    expect([first.replayed, second.replayed]).toContain(true)
    await runtime.dispose()
  })

  it('joins an active duplicate run instead of starting another agent turn', async () => {
    const fake = fakeDsh()
    const runtime = new ReviewerRuntime(fake.ctx as never, { reviewerProfilePath: '/dev/null', reviewerCapacity: 1 })
    const worker = await runtime.acquire('operation-a', '/workspace/a')
    const first = runtime.run(worker.worker_id, 'round-a', 'review this')
    await Promise.resolve()
    const duplicate = runtime.run(worker.worker_id, 'round-a', 'review this')
    await fake.completionTool?.execute({ verdict: 'looks_good' })
    fake.finishIdle()
    const [firstResult, duplicateResult] = await Promise.all([first, duplicate])
    expect(fake.followups).toBe(1)
    expect(firstResult.replayed).toBe(false)
    expect(duplicateResult.replayed).toBe(true)
    await runtime.dispose()
  })

  it('aborts only an unfinished response when the HTTP client disconnects', () => {
    const request = new EventEmitter(); const response = Object.assign(new EventEmitter(), { writableEnded: false })
    const disconnected = observeClientDisconnect(request as never, response as never)
    response.emit('close')
    expect(disconnected.signal.aborted).toBe(true)
    disconnected.dispose()

    const completedRequest = new EventEmitter(); const completedResponse = Object.assign(new EventEmitter(), { writableEnded: true })
    const completed = observeClientDisconnect(completedRequest as never, completedResponse as never)
    completedResponse.emit('close')
    expect(completed.signal.aborted).toBe(false)
    completed.dispose()
  })
})

function fakeDsh(): { readonly ctx: object; readonly completionTool: { execute(value: unknown): Promise<unknown> } | undefined; readonly creates: number; readonly followups: number; finishIdle(): void } {
  let creates = 0; let followups = 0; let completionTool: { execute(value: unknown): Promise<unknown> } | undefined; let finishIdle = (): void => {}
  const create = async (options: { readonly meta?: { readonly origin?: string }; readonly setup?: (ctx: object) => Promise<void> }): Promise<unknown> => {
    creates++
    const child = options.meta?.origin === 'subagent'
    let idle: Promise<void> = Promise.resolve()
    const agent: Record<string, unknown> = { id: `agent-${String(creates)}` }
    const agentCtx = {
      agents: { create }, agentPresets: { mount: async (): Promise<void> => {} }, systemPrompt: { section: (): (() => void) => () => {} },
      tools: { register: (tool: { execute(value: unknown): Promise<unknown> }): (() => void) => { completionTool = tool; return () => {} } },
    }
    agent.ctx = agentCtx
    agent.followup = (): void => { followups++; idle = new Promise(resolve => { finishIdle = resolve }) }
    agent.whenIdle = async (): Promise<void> => { await idle }
    agent.cancel = (): void => { finishIdle() }
    if (child && options.setup !== undefined) await options.setup(agentCtx)
    return { agent, dispose: async (): Promise<void> => {} }
  }
  return {
    ctx: { agents: { create }, get: (): undefined => undefined },
    get completionTool() { return completionTool }, get creates() { return creates }, get followups() { return followups }, finishIdle: () => finishIdle(),
  }
}
