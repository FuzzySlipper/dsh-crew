import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

const currentDshClient = createRequire(new URL('../../research/deepseek-harness/packages/client/web/package.json', import.meta.url))

export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: [
    { find: '@deepseek-ai/dsh-session-title', replacement: new URL('../../research/deepseek-harness/packages/session/session-title/lib/index.js', import.meta.url).pathname },
    { find: /^react$/, replacement: currentDshClient.resolve('react') },
    { find: /^react\/jsx-runtime$/, replacement: currentDshClient.resolve('react/jsx-runtime') },
    { find: /^react\/jsx-dev-runtime$/, replacement: currentDshClient.resolve('react/jsx-dev-runtime') },
  ] },
  test: { include: ['tests/**/*.spec.ts'] },
})
