import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  dts: true,
  outDir: 'lib',
  clean: true,
  deps: { onlyBundle: false, neverBundle: [/^@deepseek-ai\//], dts: { neverBundle: [/^@deepseek-ai\//] } },
})
