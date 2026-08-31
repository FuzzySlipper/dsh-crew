import { readFileSync } from 'node:fs'
import { defineConfig, type UserConfig } from 'tsdown'

const dsh = /^@deepseek-ai\//
const id: string = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).name

const host: UserConfig = {
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node22',
  dts: true,
  outDir: 'lib',
  clean: false,
  deps: { onlyBundle: false, neverBundle: [dsh], dts: { neverBundle: [dsh] } },
}

const client: UserConfig = {
  name: `${id}/client`,
  entry: { client: 'lib/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  dts: false,
  sourcemap: true,
  clean: false,
  external: ['react', 'react/jsx-runtime'],
  noExternal: (specifier: string) => specifier === 'react' || specifier === 'react/jsx-runtime' ? undefined : true,
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([host, client])
