import { expect, it } from 'vitest'
import remote from '../lib/typert.remote-client.js'

it('loads every generated Remote and materializes ordinary and strict input codecs', () => {
  expect(remote.package).toBe('dsh-checkin')
  expect(remote.descriptors.map(descriptor => descriptor.method).sort()).toEqual([
    'create', 'delete', 'exportData', 'importData', 'list', 'month', 'query', 'set', 'update',
  ])
  for (const method of Object.values(remote.methods)) {
    expect(method.cancellation).toEqual({ parameter: 'signal' })
    expect(method.input().create()).toBeDefined()
    expect(method.input({ strict: true }).create()).toBeDefined()
    expect(method.result.create()).toBeDefined()
    for (const parameter of method.parameters) {
      expect(parameter.codec.mode).toBe('strict')
      if (parameter.codec.mode === 'strict') expect(parameter.codec.create()).toBeDefined()
    }
  }
})

it('keeps generated request validation and the versioned backup Remote contract', () => {
  const create = remote.methods['checkin/create']
  expect(create.input().create().parse({ request: { name: '阅读' } })).toEqual({ request: { name: '阅读' } })
  expect(() => create.input({ strict: true }).create().parse({ request: { name: '阅读', unexpected: true } })).toThrow()
  expect(() => create.input().create().parse({ request: { name: 42 } })).toThrow()
  expect(() => remote.methods['checkin/set'].input().create().parse({ request: { topicId: 'topic', completed: 'yes' } })).toThrow()
  expect(remote.methods['checkin/exportData'].input().create().parse({ _request: {} })).toEqual({ _request: {} })
  expect(remote.methods['checkin/importData'].input().create().parse({ request: { json: '{}' } })).toEqual({ request: { json: '{}' } })
})
