/** React views for the additive foreign-session drawer. */

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import type { CrewForeignSessionEvent } from '../dashboard/types.ts'
import { CREW_SESSION_PROMPT_MAX_CHARS, CrewSessionWorkbenchController } from './CrewSessionWorkbench.ts'

const returnTargets = new WeakMap<CrewSessionWorkbenchController, HTMLElement>()
type TriggerProps = { readonly wide: boolean; readonly controller: CrewSessionWorkbenchController }
type OverlayProps = { readonly controller: CrewSessionWorkbenchController }

/** Render the Crew sessions action in the DSH sidebar footer. */
export function CrewSessionWorkbenchTrigger({ wide, controller }: TriggerProps): ReactNode {
  const state = useStore(controller)
  const open = (event: ReactMouseEvent<HTMLButtonElement>): void => { returnTargets.set(controller, event.currentTarget); void controller.open() }
  return <button type="button" className="dshCrewSessionsTrigger" aria-label="Open Crew sessions" aria-haspopup="dialog" aria-expanded={state.open} onClick={open}>{wide ? 'Crew sessions' : 'Crew'}</button>
}

/** Render the independent session browser and event timeline in the shell overlay. */
export function CrewSessionWorkbenchOverlay({ controller }: OverlayProps): ReactNode {
  const state = useStore(controller)
  const drawer = useRef<HTMLDivElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!state.open || drawer.current === null) return
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault(); controller.close()
    }
    const target = drawer.current.ownerDocument
    target.addEventListener('keydown', onKeyDown)
    return () => { target.removeEventListener('keydown', onKeyDown); const trigger = returnTargets.get(controller); if (trigger?.isConnected) trigger.focus() }
  }, [controller, state.open])
  if (!state.open) return null
  const selected = state.sessions.find(session => session.sessionId === state.selectedSessionId)
  return <div className="dshCrewSessionsOverlay" role="presentation"><section ref={drawer} className="dshCrewSessionsDrawer" role="dialog" aria-modal="false" aria-labelledby="dsh-crew-sessions-title" tabIndex={-1}>
    <header className="dshCrewSessionsHeader"><div><h2 id="dsh-crew-sessions-title">Crew sessions</h2><p>Sessions published by external runtime adapters.</p></div><button ref={closeButton} type="button" className="dshCrewSessionsButton" onClick={() => controller.close()}>Close</button></header>
    <div className="dshCrewSessionsGrid">
      <nav className="dshCrewSessionList" aria-label="Crew sessions">{state.loading ? <p className="dshCrewSessionsEmpty">Loading sessions…</p> : state.sessions.length === 0 ? <p className="dshCrewSessionsEmpty">No external sessions are currently published.</p> : state.sessions.map(session => <button type="button" key={session.sessionId} aria-current={session.sessionId === state.selectedSessionId || undefined} onClick={() => { void controller.select(session.sessionId) }}><strong>{session.label}</strong><small>{session.adapterId} · {session.status}{session.location === undefined ? '' : ` · ${session.location}`}</small></button>)}</nav>
      <section className="dshCrewSessionTimeline" aria-live="polite"><header className="dshCrewSessionsToolbar"><div><strong>{selected?.label ?? 'Select a session'}</strong><div className="dshCrewSessionsMuted">{selected === undefined ? 'No session selected' : selected.capabilities.join(', ') || 'No published capabilities'}</div></div><div><span className="dshCrewSessionsState" data-state={state.connection}>{state.connection}</span> <button type="button" className="dshCrewSessionsButton" onClick={() => { void controller.refresh() }}>Refresh</button></div></header><CrewPrompt controller={controller} enabled={selected !== undefined && controller.canPrompt(selected.sessionId)} /><div className="dshCrewSessionEvents">{state.error === undefined ? null : <p className="dshCrewSessionsEmpty" role="status">{state.error}</p>}{selected === undefined ? <p className="dshCrewSessionsEmpty">Choose a published session to inspect its timeline.</p> : state.events.length === 0 && state.connection === 'connecting' ? <p className="dshCrewSessionsEmpty">Loading event history…</p> : state.events.length === 0 ? <p className="dshCrewSessionsEmpty">No events have been published for this session.</p> : state.events.map(event => <EventRow key={event.cursor} event={event} />)}</div></section>
    </div>
  </section></div>
}

function CrewPrompt({ controller, enabled }: { readonly controller: CrewSessionWorkbenchController; readonly enabled: boolean }): ReactNode {
  const state = useStore(controller); const [text, setText] = useState('')
  if (!enabled) return <p className="dshCrewSessionsMuted">This runtime publishes history only; it cannot accept workbench prompts.</p>
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (await controller.submit(text)) setText('')
  }
  return <form className="dshCrewSessionPrompt" onSubmit={event => { void submit(event) }}><label htmlFor="dsh-crew-session-prompt">Send a queued prompt</label><textarea id="dsh-crew-session-prompt" maxLength={CREW_SESSION_PROMPT_MAX_CHARS} value={text} onChange={event => setText(event.target.value)} disabled={state.submitting} /><div><button type="submit" className="dshCrewSessionsButton" disabled={state.submitting || text.trim() === ''}>{state.submitting ? 'Submitting…' : 'Queue prompt'}</button>{state.submissionError === undefined ? null : <span className="dshCrewSessionsError" role="status">{state.submissionError}</span>}</div></form>
}

function EventRow({ event }: { readonly event: CrewForeignSessionEvent }): ReactNode {
  return <article className="dshCrewSessionEvent"><header><strong>{event.eventType}</strong><time dateTime={event.occurredAt}>{event.occurredAt}</time></header><pre>{formatPayload(event.payload)}</pre><small>#{event.cursor} · {event.eventId}</small></article>
}
function useStore(controller: CrewSessionWorkbenchController) { return useSyncExternalStore(listener => controller.subscribe(listener), () => controller.getSnapshot()) }
function formatPayload(value: unknown): string { try { return JSON.stringify(value, null, 2) } catch { return String(value) } }
