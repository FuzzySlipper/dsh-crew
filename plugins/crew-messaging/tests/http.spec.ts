import { describe, expect, it } from 'vitest'
import { FabricClient } from '../src/http.ts'

describe('FabricClient', () => {
  it('reads the fabric ClaimResult claimed field rather than the obsolete found field', async () => {
    const client = new FabricClient('http://fabric.test', async () => new Response(JSON.stringify({
      claimed: true, replayed: false, claim_token: 'claim',
      delivery: { delivery_id: 'd1', message_id: 'm1', recipient_address: 'beta', recipient_generation: 1, state: 'claimed' },
      message: { message_id: 'm1', sender_address: 'alpha', recipient_address: 'beta', body: 'hello' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    const result = await client.claim({})
    expect(result.claimed).toBe(true)
    expect('found' in result).toBe(false)
  })
})
