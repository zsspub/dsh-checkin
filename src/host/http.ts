import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { z } from 'zod'
import type { CheckinErrorCode } from '../types.ts'

export function failure(code: CheckinErrorCode): RemoteError<CheckinErrorCode> { return new RemoteError(code, code, {}) }

export class PubClient {
  private readonly lifetime = new AbortController()
  constructor(private readonly apiKey: string, private readonly timeout = 15000) {
    if (!apiKey.trim() || /[\r\n]/u.test(apiKey) || !Number.isSafeInteger(timeout) || timeout < 1) throw failure('checkin/invalid-config')
  }
  close(): void { this.lifetime.abort() }
  async request(path: string, signal?: AbortSignal, body?: unknown, write = false): Promise<Response> {
    const combined = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(this.timeout), ...(signal ? [signal] : [])])
    combined.throwIfAborted()
    let response: Response
    try {
      response = await fetch(`https://zss.pub/api${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'x-api-key': this.apiKey, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: combined, redirect: 'error', credentials: 'omit',
      })
    } catch { throw failure(write ? 'checkin/write-uncertain' : 'checkin/service-unavailable') }
    if (response.ok) return response
    if (response.status === 401) {
      let rateLimited = false
      try {
        const body = await response.clone().json()
        rateLimited = body && typeof body === 'object' && 'code' in body && body.code === 'RATE_LIMITED'
      } catch {
        rateLimited = false
      }
      if (rateLimited) throw failure('checkin/rate-limited')
    }
    if (response.status === 400) throw failure('checkin/query-rejected')
    if (response.status === 401 || response.status === 403) throw failure('checkin/unauthorized')
    if (response.status === 404) throw failure('checkin/api-unavailable')
    if (response.status === 409) throw failure('checkin/database-conflict')
    if (response.status === 413) throw failure('checkin/request-too-large')
    if (response.status === 429) throw failure('checkin/rate-limited')
    if (response.status === 503) throw failure('checkin/service-unavailable')
    throw failure(write ? 'checkin/write-uncertain' : 'checkin/service-unavailable')
  }
  async parse<Shape extends z.ZodType>(response: Response, schema: Shape): Promise<z.infer<Shape>> {
    try { return schema.parse(await response.json()) }
    catch { throw failure('checkin/invalid-response') }
  }
}
