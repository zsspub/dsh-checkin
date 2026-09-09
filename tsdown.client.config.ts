import { defineConfig } from 'tsdown'

const ID = 'dsh-checkin'
const EXTERNALS = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  '@deepseek-ai/dsh-client-ui-primitives',
])

export default defineConfig({
  entry: { client: 'lib/types/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  dts: false,
  clean: false,
  minify: true,
  sourcemap: true,
  deps: {
    onlyBundle: false,
    neverBundle: specifier => EXTERNALS.has(specifier),
    alwaysBundle: specifier => !EXTERNALS.has(specifier),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
})
