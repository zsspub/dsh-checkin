import { z } from 'zod'
import type { CheckinBackup, TopicId } from './types.ts'

export const CHECKIN_BACKUP_MAX_BYTES = 20 * 1024 * 1024

const timestamp = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)))
const topic = z.strictObject({
  id: z.string().min(1).refine(value => value.trim().length > 0),
  name: z.string().min(1).max(200).refine(value => value === value.trim()),
  createdAt: timestamp,
  updatedAt: timestamp,
}).refine(value => Date.parse(value.createdAt) <= Date.parse(value.updatedAt))
const completionV1 = z.strictObject({
  topicId: z.string().min(1),
  date: z.iso.date().refine(value => value >= '0001-01-01'),
})
const completionV2 = completionV1.extend({
  createdAt: timestamp,
})
const backupFields = {
  format: z.literal('dsh-checkin'),
  exportedAt: timestamp,
  topics: z.array(topic),
}
const backup = z.union([
  z.strictObject({
    ...backupFields,
    version: z.literal(1),
    completions: z.array(z.union([completionV1, completionV2])),
  }),
  z.strictObject({
    ...backupFields,
    version: z.literal(2),
    completions: z.array(completionV2),
  }),
])

export function assertBackupSize(json: string): void {
  if (new TextEncoder().encode(json).byteLength > CHECKIN_BACKUP_MAX_BYTES) {
    throw new Error('checkin/backup-too-large')
  }
}

function assertUnique(values: readonly string[]): void {
  if (new Set(values).size !== values.length) throw new Error('checkin/invalid-backup')
}

/** Strictly parse a portable backup in both the browser and Host. */
export function parseCheckinBackup(json: string, today?: string): CheckinBackup {
  assertBackupSize(json)
  let value: unknown
  try {
    value = JSON.parse(json.replace(/^\uFEFF/u, ''))
  } catch {
    throw new Error('checkin/invalid-backup')
  }
  const parsed = backup.safeParse(value)
  if (!parsed.success) throw new Error('checkin/invalid-backup')
  const result = parsed.data
  assertUnique(result.topics.map(item => item.id))
  assertUnique(result.topics.map(item => item.name))
  assertUnique(result.completions.map(item => `${item.topicId}\0${item.date}`))
  const topicIds = new Set(result.topics.map(item => item.id))
  if (result.completions.some(item => !topicIds.has(item.topicId) || (today !== undefined && item.date > today))) {
    throw new Error('checkin/invalid-backup')
  }
  return {
    format: result.format,
    version: 2,
    exportedAt: result.exportedAt,
    topics: result.topics.map(item => ({ ...item, id: item.id as TopicId })),
    completions: result.completions.map(item => ({
      ...item,
      topicId: item.topicId as TopicId,
      createdAt: 'createdAt' in item ? item.createdAt : result.exportedAt,
    })),
  }
}
