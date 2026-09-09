import { defineConfig } from 'vitest/config'
export default defineConfig({ esbuild: { jsx: 'automatic' }, test: { environmentMatchGlobs: [['tests/client*.spec.tsx', 'jsdom']], coverage: { provider: 'v8', include: ['src/**/*.ts', 'src/**/*.tsx'] } } })
