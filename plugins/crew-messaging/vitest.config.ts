import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { defineConfig } from 'vitest/config'

const dshRoot = process.env.DSH_SOURCE_DIR ?? '/home/system/dsh'
const dshFile = (path: string) => pathToFileURL(resolve(dshRoot, path))
const currentDshClient = createRequire(dshFile('packages/client/web/package.json'))

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: [
    { find: '@deepseek-ai/dsh-session-title', replacement: dshFile('packages/session/session-title/lib/index.js').pathname },
    { find: /^react$/, replacement: currentDshClient.resolve('react') },
    { find: /^react\/jsx-runtime$/, replacement: currentDshClient.resolve('react/jsx-runtime') },
    { find: /^react\/jsx-dev-runtime$/, replacement: currentDshClient.resolve('react/jsx-dev-runtime') },
  ] },
  test: { include: ['tests/**/*.spec.ts'] },
})
