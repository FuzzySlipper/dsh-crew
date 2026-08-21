import { defineConfig } from 'tsdown'

const dsh = /^@deepseek-ai\//

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  dts: true,
  outDir: 'lib',
  clean: true,
  deps: { onlyBundle: false, neverBundle: [dsh], dts: { neverBundle: [dsh] } },
})
