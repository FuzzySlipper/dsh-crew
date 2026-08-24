/** Browser-safe projection types for the Crew settings cockpit. */

/** One model-facing Crew address, without its DSH target reference. */
export interface CrewDirectoryEntry {
  readonly address: string
  readonly status: 'routable' | 'ambiguous' | 'conflict'
  readonly source: 'configured' | 'session-title'
}

/** Safe adapter lifecycle observations. */
export interface CrewAdapterStatus {
  readonly initialized: boolean
  readonly stopped: boolean
  readonly connected: boolean
  readonly leaseExpiresAt?: string
}

/** Effective adapter timings. They change only when the DSH plugin restarts. */
export interface CrewRuntimeTuning {
  readonly leaseDuration: string
  readonly renewMs: number
  readonly pollMs: number
  readonly claimDuration: string
  readonly ttl: string
  readonly acceptanceTimeoutMs: number
  readonly acceptancePollMs: number
}

/** Immutable message facts safe to show in the browser. */
export interface CrewMessageSummary {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly replyTo?: string
  readonly createdAt: string
  readonly preview: string
}

/** Mutable delivery facts safe to show in the browser. */
export interface CrewDeliverySummary {
  readonly id: string
  readonly messageId: string
  readonly recipient: string
  readonly state: string
  readonly action?: string
  readonly updatedAt?: string
}

/** Bounded, read-only same-origin cockpit response. */
export interface CrewDashboardSnapshot {
  readonly fabric: { readonly ready: boolean; readonly status: string }
  readonly adapter: CrewAdapterStatus
  readonly directory: readonly CrewDirectoryEntry[]
  readonly tuning: CrewRuntimeTuning
  readonly messages: readonly CrewMessageSummary[]
  readonly deliveries: readonly CrewDeliverySummary[]
}

/** Browser-safe projection of one adapter-owned foreign runtime session. */
export interface CrewForeignSession {
  readonly sessionId: string
  readonly adapterId: string
  readonly label: string
  readonly location?: string
  readonly status: string
  readonly capabilities: readonly string[]
  readonly revision: number
  readonly createdAt: string
  readonly updatedAt: string
}

/** Browser-safe, append-only observation from a foreign runtime session. */
export interface CrewForeignSessionEvent {
  readonly eventId: string
  readonly sessionId: string
  readonly sequence: number
  readonly cursor: number
  readonly eventType: string
  /** Adapter-owned event data, with routing credentials and opaque targets removed. */
  readonly payload: unknown
  readonly occurredAt: string
  readonly recordedAt: string
}

/** Bounded read-only response for the foreign-session workbench. */
export interface CrewForeignSessionsSnapshot {
  readonly sessions: readonly CrewForeignSession[]
}

/** Bounded read-only response for one foreign session timeline. */
export interface CrewForeignSessionEventsSnapshot {
  readonly events: readonly CrewForeignSessionEvent[]
}
