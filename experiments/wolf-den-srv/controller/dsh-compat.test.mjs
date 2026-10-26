// Read-only target probe through the installed, moving DSH Cordis MCP plugin.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const dsh = process.env.DSH_SOURCE_DIR || '/home/system/dsh'
const require = createRequire(`${dsh}/packages/mcp/mcp-client/package.json`)
const { Context } = await import(require.resolve('@deepseek-ai/cordis'))
const { default: ToolRuntime } = await import(require.resolve('@deepseek-ai/dsh-tools'))
const { default: SystemPrompt } = await import(`${dsh}/packages/core/system-prompt/lib/index.js`)
const mcp = await import(`${dsh}/packages/mcp/mcp-client/lib/index.js`)
const { load } = await import(createRequire(`${dsh}/apps/cli/package.json`).resolve('js-yaml'))

test('Cordis loads our overlay, discovers tools, reads den-srv, and unloads', async () => {
  const overlay = load(await readFile(new URL('./cordis.patch.yml', import.meta.url), 'utf8'))
  const config = mcp.Config(overlay[0].insert[0].config)
  const ctx = new Context()
  try {
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(mcp, config)
    const names = ctx.tools.schemas().map(x => x.name).sort()
    assert.deepEqual(names, ['games', 'game', 'start', 'status', 'observe', 'input', 'run', 'script', 'cancel', 'resume', 'recover', 'stop']
      .map(x => `mcp__playtest__${x}`).sort())
    const runSchema = ctx.tools.schemas().find(x => x.name === 'mcp__playtest__run')
    assert.ok(JSON.stringify(runSchema).includes('"source"'), 'Script submission reaches DSH tool schema')
    const result = await ctx.tools.execute({
      signal: new AbortController().signal, callId: 'wolf-compat-status',
      name: 'mcp__playtest__status', arguments: {},
    })
    assert.equal(result.isError, false, JSON.stringify(result))
    const status = JSON.parse(result.content.find(x => x.type === 'text').text)
    assert.ok(Array.isArray(status.target.sessions))
    assert.ok(Array.isArray(status.target.lobbies))
    console.log(`Target reachable; ${status.target.sessions.length} session(s), ${status.target.lobbies.length} lobby/lobbies`)
  } finally {
    await ctx.fiber.dispose()
  }
})
