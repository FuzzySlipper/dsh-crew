import { defineConfig } from 'vitest/config'
export default defineConfig({
  root: new URL('.', import.meta.url).pathname,
  resolve: { alias: { '@deepseek-ai/dsh-session-title': new URL('../../research/deepseek-harness/packages/session/session-title/lib/index.js', import.meta.url).pathname } },
  test: { include: ['tests/**/*.spec.ts'] },
})
