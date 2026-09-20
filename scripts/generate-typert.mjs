import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { FaceModelEmitter, WorkspaceAnalyzer } from '@deepseek-ai/dsh-typert-generator'

const root = resolve(import.meta.dirname, '..')
const workspace = join(root, 'node_modules', '.cache', 'dsh-checkin-typert')
const packageRoot = join(workspace, 'packages', 'dsh-checkin')
const protocolRoot = join(workspace, 'packages', 'typert-protocol')

await rm(workspace, { recursive: true, force: true })
await mkdir(packageRoot, { recursive: true })
await mkdir(join(protocolRoot, 'src'), { recursive: true })
await cp(join(root, 'src'), join(packageRoot, 'src'), { recursive: true })
const packageManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
packageManifest.exports = {
  '.': packageManifest.exports['.'],
  './types': packageManifest.exports['./types'],
}
await writeFile(join(packageRoot, 'package.json'), JSON.stringify(packageManifest, null, 2))
await writeFile(join(workspace, 'tsconfig.host.json'), JSON.stringify({
  files: [],
  compilerOptions: {
    target: 'ES2024',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    skipLibCheck: true,
    baseUrl: '.',
    paths: {
      '@deepseek-ai/dsh-typert-protocol': ['./packages/typert-protocol/src/index.ts'],
      '*': [join(root, 'node_modules', '*')],
    },
  },
  references: [
    { path: './packages/typert-protocol' },
    { path: './packages/dsh-checkin' },
  ],
}, null, 2))
await writeFile(join(protocolRoot, 'package.json'), JSON.stringify({
  name: '@deepseek-ai/dsh-typert-protocol',
  type: 'module',
  exports: { '.': './lib/index.js' },
}, null, 2))
await writeFile(join(protocolRoot, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2024',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    noEmit: true,
  },
  include: ['src/index.ts'],
}, null, 2))
await writeFile(join(protocolRoot, 'src', 'index.ts'), `
import type { Context } from '@deepseek-ai/cordis'
export interface RemoteErrorDetailsMap {}
export declare class RemoteError<C extends keyof RemoteErrorDetailsMap> extends Error { constructor(code: C, message: string, details: RemoteErrorDetailsMap[C]) }
export interface TypertLookupMap {}
export interface TypertContextMap {}
export abstract class TypertRemoteService {
  protected constructor(_ctx: Context, _serviceKey: string) {}
}
export declare function Remote<This extends object, Args extends unknown[], Result>(
  method: (this: This, ...args: Args) => Result,
  context: ClassMethodDecoratorContext<This, (this: This, ...args: Args) => Result>,
): void
`)
await writeFile(join(packageRoot, 'tsconfig.json'), JSON.stringify({
  compilerOptions: {
    target: 'ES2024',
    module: 'NodeNext',
    moduleResolution: 'NodeNext',
    strict: true,
    skipLibCheck: true,
    allowImportingTsExtensions: true,
    rewriteRelativeImportExtensions: true,
    noEmit: true,
    types: ['node'],
    baseUrl: '.',
    paths: {
      '@deepseek-ai/dsh-typert-protocol': ['../typert-protocol/src/index.ts'],
      '*': [join(root, 'node_modules', '*')],
    },
  },
  include: ['src/index.ts', 'src/types.ts', 'src/host/**/*.ts'],
}, null, 2))

try {
  const model = new WorkspaceAnalyzer({
    root: workspace,
    packages: ['dsh-checkin'],
    faces: ['host'],
  }).analyze()
  const face = model.faces.find(candidate => candidate.face === 'host')
  const packageModel = face?.packages.find(candidate => candidate.name === 'dsh-checkin')
  if (face === undefined || packageModel === undefined) throw new Error('Typert found no Host package model')
  const artifact = new FaceModelEmitter(face).emit('dsh-checkin')
  if (artifact.remote === undefined) {
    throw new Error(`Typert found ${String(packageModel.invocations.length)} Remote methods`)
  }
  for (const [name, source] of [
    ['Host', artifact.js],
    ['Remote Client', artifact.remote.js],
  ]) {
    const strictCodecs = [...source.matchAll(/\bmode:\s*['"]strict['"]/gu)].length
    const strictFactories = [
      ...source.matchAll(/\bmode:\s*['"]strict['"],\s*\n\s*typeSymbol:[^\n]+,\s*\n\s*create:\s*/gu),
    ].length
    if (strictFactories !== strictCodecs) {
      throw new Error(
        `${name} Typert artifact has ${String(strictCodecs - strictFactories)} strict codec(s) without create() factories`,
      )
    }
  }
  await mkdir(join(root, 'lib'), { recursive: true })
  await Promise.all([
    writeFile(join(root, 'lib', 'typert.host.js'), artifact.js),
    writeFile(join(root, 'lib', 'typert.host.d.ts'), artifact.dts),
    writeFile(join(root, 'lib', 'typert.remote-client.js'), artifact.remote.js),
    writeFile(join(root, 'lib', 'typert.remote-client.d.ts'), artifact.remote.dts),
    writeFile(join(root, 'lib', 'typert.remote-client.d.ts.map'), artifact.remote.dtsMap),
  ])
} finally {
  await rm(workspace, { recursive: true, force: true })
}
