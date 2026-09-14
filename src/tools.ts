/** Model-facing check-in tools; all writes use the same Host service as the drawer. */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from './index.ts'
import type { TopicId } from './types.ts'
/** Cordis tool plugin identifier. */
export const name = 'checkin-tools'
/** Required Host capabilities. */
export const inject = ['tools', 'checkin']
const TOPIC = { type: 'object', additionalProperties: false, properties: { id: { type: 'string', required: true }, name: { type: 'string', required: true }, createdAt: { type: 'string', required: true }, updatedAt: { type: 'string', required: true } } } as const
const TOPICS = { type: 'array', items: TOPIC, required: true } as const
const CLOCK = { today: { type: 'string', required: true }, timeZone: { type: 'string', required: true } } as const
const ID = { type: 'string', required: true, description: 'Exact topic ID from checkin_topic_list; never guess an ID.' } as const
const NAME = { type: 'string', required: true, description: 'Unique topic name, 1–200 characters after trimming.' } as const
/** Register tools whose inputs/results use DSH's ordinary Session log.
 * @param ctx - Host context containing the check-in service.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'checkin_topic_create', description: 'Create a daily check-in topic in the configured Pub database, shared across sessions. Only a completed/not-completed status is tracked. If a write returns checkin/write-uncertain, query the current state before retrying; it may already have succeeded.',
    parameters: { name: NAME }, output: { schema: TOPIC, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    execute: (args, exec) => ctx.checkin.create(args, exec.signal),
    presentCall: args => ({ card: 'generic', title: `Create check-in topic: ${args.name}`, kind: 'other', rawInput: args }),
  })), 'checkin: create tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'checkin_topic_list', description: 'Find topic IDs and names before check-in, rename or deletion. Returns today in Asia/Shanghai. Ask the user if a topic reference is ambiguous.',
    parameters: {}, output: { schema: { type: 'object', additionalProperties: false, properties: { ...CLOCK, topics: TOPICS } }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    execute: (_args, exec) => ctx.checkin.list(exec.signal),
    presentCall: args => ({ card: 'generic', title: 'List check-in topics', kind: 'search', rawInput: args }),
  })), 'checkin: list tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'checkin_topic_update', description: 'Rename an existing check-in topic without changing its historical completions. Resolve its ID with checkin_topic_list.',
    parameters: { id: ID, name: NAME }, output: { schema: TOPIC, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    execute: (args, exec) => ctx.checkin.update({ ...args, id: args.id as TopicId }, exec.signal),
    presentCall: args => ({ card: 'generic', title: `Rename check-in topic: ${args.name}`, kind: 'other', rawInput: args }),
  })), 'checkin: update tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'checkin_topic_delete', description: 'Permanently delete a topic AND all its completed dates only when the user requests topic deletion. To undo one daily check-in, use checkin_set(completed=false) instead.',
    parameters: { id: ID }, output: { schema: { type: 'object', additionalProperties: false, properties: { topic: { ...TOPIC, required: true }, deletedRecords: { type: 'integer', required: true } } }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    execute: (args, exec) => ctx.checkin.delete({ id: args.id as TopicId }, exec.signal),
    presentCall: args => ({ card: 'generic', title: 'Delete check-in topic and history', kind: 'other', rawInput: args }),
  })), 'checkin: delete tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'checkin_set', description: 'Set a topic as completed or incomplete on a Beijing calendar date. Omitted date means today in Asia/Shanghai. Any past date is allowed, future dates are rejected. Repeated sequential writes keep the same status. Resolve topicId with checkin_topic_list first. For checkin/write-uncertain or checkin/concurrent-change, read current state before retrying any write. SQL updates and deletes check the previously read revision.',
    parameters: { topicId: ID, date: { type: 'string', description: 'YYYY-MM-DD in Asia/Shanghai, defaults to today.' }, completed: { type: 'boolean', required: true, description: 'true completes the day; false removes the completion.' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { topic: { ...TOPIC, required: true }, date: { type: 'string', required: true }, completed: { type: 'boolean', required: true } } }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    execute: (args, exec) => ctx.checkin.set({ ...args, topicId: args.topicId as TopicId }, exec.signal),
    presentCall: args => ({ card: 'generic', title: args.completed ? 'Complete daily check-in' : 'Undo daily check-in', kind: 'other', rawInput: args }),
  })), 'checkin: set tool')
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'checkin_query', description: 'Query an inclusive range of Beijing dates, optionally for one topic. Returns current topics and only completed topic/date pairs; absent pairs are incomplete. Historical totals use the current topic catalog, with no start date. Future days are read-only, not missed days.',
    parameters: { from: { type: 'string', required: true, description: 'Inclusive YYYY-MM-DD.' }, to: { type: 'string', required: true, description: 'Inclusive YYYY-MM-DD.' }, topicId: { type: 'string', description: 'Exact topic ID; omit to select all topics.' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { ...CLOCK, from: { type: 'string', required: true }, to: { type: 'string', required: true }, topics: TOPICS, completions: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { topicId: { type: 'string', required: true }, date: { type: 'string', required: true } } } } } }, render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }] },
    execute: (args, exec) => ctx.checkin.query({ from: args.from, to: args.to, ...(args.topicId === undefined ? {} : { topicId: args.topicId as TopicId }) }, exec.signal),
    presentCall: args => ({ card: 'generic', title: `Check-in history: ${args.from} – ${args.to}`, kind: 'search', rawInput: args }),
  })), 'checkin: query tool')
}
