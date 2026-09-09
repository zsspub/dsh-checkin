import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../lib/', import.meta.url))

function normalize(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      normalize(path)
      continue
    }
    if (!/\.(?:js|d\.ts|map)$/u.test(entry.name)) continue
    const source = readFileSync(path, 'utf8')
    const normalized = `${source.replace(/[\t ]+$/gmu, '').replace(/\n*$/u, '')}\n`
    if (normalized !== source) writeFileSync(path, normalized)
  }
}

normalize(root)
