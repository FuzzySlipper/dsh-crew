/** Host-only read model for the Crew settings cockpit. */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { CrewMessagingConfig } from '../service.ts'
import type {
  CrewAdapterStatus, CrewDashboardSnapshot, CrewDeliverySummary, CrewDirectoryEntry, CrewMessageSummary, CrewRuntimeTuning,
} from './types.ts'

/** Same-origin endpoint served by the DSH plugin. */
export const CREW_DASHBOARD_PATH = '/plugins/dsh-crew-messaging/dashboard'

/** The cockpit renders enough recent traffic for orientation, never an unbounded ledger. */
export const CREW_DASHBOARD_TRAFFIC_LIMIT = 20

/** Runtime facts the adapter exposes to this read-only host projection. */
export interface CrewDashboardAdapter {
  directory(): readonly CrewDirectoryEntry[]
  status(): CrewAdapterStatus
}

/** Testable request surface for the fabric's local JSON endpoints. */
export type DashboardFetch = (input: URL, init?: RequestInit) => Promise<Response>

const defaults: CrewRuntimeTuning = {
  leaseDuration: '2m', renewMs: 45_000, pollMs: 1_000, claimDuration: '45s', ttl: '24h', acceptanceTimeoutMs: 1_000, acceptancePollMs: 10,
}

/** Resolve the tunable values shown by the read-only cockpit. */
export function dashboardTuning(config: CrewMessagingConfig): CrewRuntimeTuning {
  return {
    leaseDuration: config.leaseDuration ?? defaults.leaseDuration,
    renewMs: config.renewMs ?? defaults.renewMs,
    pollMs: config.pollMs ?? defaults.pollMs,
    claimDuration: config.claimDuration ?? defaults.claimDuration,
    ttl: config.ttl ?? defaults.ttl,
    acceptanceTimeoutMs: config.acceptanceTimeoutMs ?? defaults.acceptanceTimeoutMs,
    acceptancePollMs: config.acceptancePollMs ?? defaults.acceptancePollMs,
  }
}

/** Build the safe snapshot from one adapter and its trusted-loopback fabric. */
export async function crewDashboardSnapshot(input: {
  readonly adapter: CrewDashboardAdapter
  readonly tuning: CrewRuntimeTuning
  readonly fabricUrl: string
  readonly request?: DashboardFetch
}): Promise<CrewDashboardSnapshot> {
  const request = input.request ?? fetch
  const [ready, traffic] = await Promise.all([
    readJson(request, new URL('/readyz', input.fabricUrl)),
    readJson(request, new URL('/v1/traffic', input.fabricUrl)),
  ])
  return {
    fabric: projectReadiness(ready),
    adapter: input.adapter.status(),
    directory: input.adapter.directory().map(projectDirectory),
    tuning: input.tuning,
    messages: projectMessages(traffic),
    deliveries: projectDeliveries(traffic),
  }
}

/** Own one response lifecycle for the same-origin, read-only endpoint. */
export function crewDashboardHandler(input: {
  readonly adapter: CrewDashboardAdapter
  readonly tuning: CrewRuntimeTuning
  readonly fabricUrl: string
  readonly request?: DashboardFetch
}): (request: IncomingMessage, response: ServerResponse) => Promise<void> {
  return async (request, response) => {
    if (request.method !== 'GET') {
      response.writeHead(405, { allow: 'GET' })
      response.end()
      return
    }
    try {
      const snapshot = await crewDashboardSnapshot(input)
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      response.end(JSON.stringify(snapshot))
    } catch {
      response.writeHead(503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      response.end(JSON.stringify({ error: 'Crew messaging fabric is unavailable' }))
    }
  }
}

async function readJson(request: DashboardFetch, url: URL): Promise<unknown> {
  const response = await request(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(1_500) })
  if (!response.ok) throw new Error(`fabric response ${String(response.status)}`)
  return await response.json()
}

function projectReadiness(value: unknown): { ready: boolean; status: string } {
  const record = object(value)
  return { ready: true, status: text(record?.status) ?? 'ok' }
}

function projectDirectory(value: CrewDirectoryEntry): CrewDirectoryEntry {
  return { address: value.address, status: value.status, source: value.source }
}

function projectMessages(value: unknown): readonly CrewMessageSummary[] {
  const records = array(object(value)?.messages)
  return records.slice(-CREW_DASHBOARD_TRAFFIC_LIMIT).reverse().flatMap((entry) => {
    const id = text(entry.message_id)
    const from = text(entry.sender_address)
    const to = text(entry.recipient_address)
    const createdAt = text(entry.created_at)
    if (id === undefined || from === undefined || to === undefined || createdAt === undefined) return []
    return [{ id, from, to, createdAt, preview: preview(text(entry.body) ?? ''), ...(optional('replyTo', text(entry.reply_to_message_id))) }]
  })
}

function projectDeliveries(value: unknown): readonly CrewDeliverySummary[] {
  const records = array(object(value)?.deliveries)
  return records.slice(-CREW_DASHBOARD_TRAFFIC_LIMIT).reverse().flatMap((entry) => {
    const id = text(entry.delivery_id)
    const messageId = text(entry.message_id)
    const recipient = text(entry.recipient_address)
    const state = text(entry.state)
    if (id === undefined || messageId === undefined || recipient === undefined || state === undefined) return []
    const updatedAt = text(entry.terminal_at) ?? text(entry.dispatching_at) ?? text(entry.claimed_at) ?? text(entry.created_at)
    return [{ id, messageId, recipient, state, ...(optional('action', text(entry.dispatch_action))), ...(optional('updatedAt', updatedAt)) }]
  })
}

function object(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
function array(value: unknown): readonly Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => object(entry) !== undefined) : []
}
function text(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined }
function optional<K extends string>(key: K, value: string | undefined): Partial<Record<K, string>> { return value === undefined ? {} : { [key]: value } as Record<K, string> }
function preview(value: string): string { return value.length <= 160 ? value : `${value.slice(0, 157)}...` }
