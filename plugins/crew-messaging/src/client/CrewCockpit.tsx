/** Read-only global Crew settings cockpit. */

import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { CrewDashboardSnapshot } from '../dashboard/types.ts'
import css from './CrewCockpit.styles.ts'
import { CrewReviewPanel } from './CrewReviewPanel.tsx'

export const CREW_DASHBOARD_ENDPOINT = '/plugins/dsh-crew-messaging/dashboard'
const POLL_MS = 5_000

type SnapshotState =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly snapshot: CrewDashboardSnapshot }
  | { readonly kind: 'error'; readonly message: string }

/** Decode the narrow response the Host projection owns. */
export function decodeCrewDashboard(value: unknown): CrewDashboardSnapshot | undefined {
  if (!isObject(value) || !isObject(value.fabric) || !isObject(value.adapter) || !isObject(value.tuning)
    || !Array.isArray(value.directory) || !Array.isArray(value.messages) || !Array.isArray(value.deliveries)) return undefined
  const fabric = value.fabric
  const adapter = value.adapter
  const tuning = value.tuning
  if (typeof fabric.ready !== 'boolean' || typeof fabric.status !== 'string'
    || typeof adapter.initialized !== 'boolean' || typeof adapter.stopped !== 'boolean' || typeof adapter.connected !== 'boolean' || (adapter.leaseExpiresAt !== undefined && typeof adapter.leaseExpiresAt !== 'string')
    || !tuningValid(tuning)) return undefined
  const directory = value.directory.flatMap(directoryEntry)
  const messages = value.messages.flatMap(messageSummary)
  const deliveries = value.deliveries.flatMap(deliverySummary)
  if (directory.length !== value.directory.length || messages.length !== value.messages.length || deliveries.length !== value.deliveries.length) return undefined
  return {
    fabric: { ready: fabric.ready, status: fabric.status },
    adapter: { initialized: adapter.initialized, stopped: adapter.stopped, connected: adapter.connected, ...(adapter.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: adapter.leaseExpiresAt }) },
    directory, tuning: {
      leaseDuration: tuning.leaseDuration, renewMs: tuning.renewMs, pollMs: tuning.pollMs, claimDuration: tuning.claimDuration,
      ttl: tuning.ttl, acceptanceTimeoutMs: tuning.acceptanceTimeoutMs, acceptancePollMs: tuning.acceptancePollMs,
    }, messages, deliveries,
  }
}

/** Render the v1 Crew global settings page. */
export function CrewCockpit(): ReactNode {
  const [state, setState] = useState<SnapshotState>({ kind: 'loading' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    const load = async (): Promise<void> => {
      try {
        const response = await fetch(CREW_DASHBOARD_ENDPOINT, { cache: 'no-store' })
        if (!response.ok) throw new Error(`request failed (${String(response.status)})`)
        const snapshot = decodeCrewDashboard(await response.json())
        if (snapshot === undefined) throw new Error('received an invalid dashboard response')
        if (active) setState({ kind: 'ready', snapshot })
      } catch (error: unknown) {
        if (active) setState({ kind: 'error', message: error instanceof Error ? error.message : 'request failed' })
      }
    }
    void load()
    const timer = window.setInterval(() => { void load() }, POLL_MS)
    return () => { active = false; window.clearInterval(timer) }
  }, [retry])
  if (state.kind === 'loading') return <section className={css.section}><p>Loading Crew messaging…</p><CrewReviewPanel /></section>
  if (state.kind === 'error') return <section className={css.section}><p className={css.error}>Crew messaging is unavailable: {state.message}</p><button type="button" className={css.secondary} onClick={() => { setRetry(value => value + 1) }}>Retry</button><CrewReviewPanel /></section>
  return <SnapshotView snapshot={state.snapshot} />
}

function SnapshotView({ snapshot }: { readonly snapshot: CrewDashboardSnapshot }): ReactNode {
  return <section className={css.section} data-crew-cockpit>
    <header className={css.header}><div><h2>Crew messaging</h2><p>Read-only adapter and fabric status. Changes to runtime tuning require a DSH service restart.</p></div><span className={snapshot.fabric.ready && snapshot.adapter.connected ? css.good : css.warning}>{snapshot.fabric.ready && snapshot.adapter.connected ? 'Connected' : 'Unavailable'}</span></header>
    <div className={css.status}><Status label="Fabric" value={snapshot.fabric.status} /><Status label="Adapter" value={snapshot.adapter.stopped ? 'stopped' : snapshot.adapter.initialized ? 'running' : 'starting'} /><Status label="Lease" value={snapshot.adapter.connected ? snapshot.adapter.leaseExpiresAt === undefined ? 'active' : `active until ${snapshot.adapter.leaseExpiresAt}` : 'absent'} /></div>
    <Panel title="Directory" empty="No Crew addresses are currently discoverable." hasItems={snapshot.directory.length > 0}><div className={css.rows}>{snapshot.directory.map(entry => <div className={css.row} key={entry.address}><strong>{entry.address}</strong><span>{entry.source === 'configured' ? 'configured' : 'session title'}</span><span className={entry.status === 'routable' ? css.good : css.warning}>{entry.status}</span></div>)}</div></Panel>
    <Panel title="Recent messages" empty="No recent Crew messages." hasItems={snapshot.messages.length > 0}><div className={css.traffic}>{snapshot.messages.map(message => <article className={css.trafficRow} key={message.id}><div><strong>{message.from} → {message.to}</strong><span>{message.createdAt}</span></div><p>{message.preview || '(empty message)'}</p><small>{message.id}{message.replyTo === undefined ? '' : ` · reply to ${message.replyTo}`}</small></article>)}</div></Panel>
    <Panel title="Recent deliveries" empty="No recent Crew deliveries." hasItems={snapshot.deliveries.length > 0}><div className={css.traffic}>{snapshot.deliveries.map(delivery => <article className={css.trafficRow} key={delivery.id}><div><strong>{delivery.recipient}</strong><span className={delivery.state === 'delivered' ? css.good : css.warning}>{delivery.state}</span></div><small>{delivery.messageId}{delivery.action === undefined ? '' : ` · ${delivery.action}`}{delivery.updatedAt === undefined ? '' : ` · ${delivery.updatedAt}`}</small></article>)}</div></Panel>
    <Panel title="Runtime tuning" empty="" hasItems><dl className={css.tuning}>{Object.entries(snapshot.tuning).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{String(value)}</dd></div>)}</dl></Panel>
    <CrewReviewPanel />
  </section>
}

function Status({ label, value }: { readonly label: string; readonly value: string }): ReactNode { return <div><span>{label}</span><strong>{value}</strong></div> }
function Panel({ title, empty, hasItems, children }: { readonly title: string; readonly empty: string; readonly hasItems: boolean; readonly children: ReactNode }): ReactNode { return <section className={css.panel}><h3>{title}</h3>{hasItems ? children : <p className={css.empty}>{empty}</p>}</section> }

function isObject(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function tuningValid(value: Record<string, unknown>): value is Record<string, unknown> & CrewDashboardSnapshot['tuning'] { return typeof value.leaseDuration === 'string' && typeof value.renewMs === 'number' && typeof value.pollMs === 'number' && typeof value.claimDuration === 'string' && typeof value.ttl === 'string' && typeof value.acceptanceTimeoutMs === 'number' && typeof value.acceptancePollMs === 'number' }
function directoryEntry(value: unknown): CrewDashboardSnapshot['directory'][number][] { return isObject(value) && typeof value.address === 'string' && (value.status === 'routable' || value.status === 'ambiguous' || value.status === 'conflict') && (value.source === 'configured' || value.source === 'session-title') ? [{ address: value.address, status: value.status, source: value.source }] : [] }
function messageSummary(value: unknown): CrewDashboardSnapshot['messages'][number][] { return isObject(value) && typeof value.id === 'string' && typeof value.from === 'string' && typeof value.to === 'string' && typeof value.createdAt === 'string' && typeof value.preview === 'string' && (value.replyTo === undefined || typeof value.replyTo === 'string') ? [{ id: value.id, from: value.from, to: value.to, createdAt: value.createdAt, preview: value.preview, ...(value.replyTo === undefined ? {} : { replyTo: value.replyTo }) }] : [] }
function deliverySummary(value: unknown): CrewDashboardSnapshot['deliveries'][number][] { return isObject(value) && typeof value.id === 'string' && typeof value.messageId === 'string' && typeof value.recipient === 'string' && typeof value.state === 'string' && (value.action === undefined || typeof value.action === 'string') && (value.updatedAt === undefined || typeof value.updatedAt === 'string') ? [{ id: value.id, messageId: value.messageId, recipient: value.recipient, state: value.state, ...(value.action === undefined ? {} : { action: value.action }), ...(value.updatedAt === undefined ? {} : { updatedAt: value.updatedAt }) }] : [] }
