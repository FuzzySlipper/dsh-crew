/** Sidebar footer action and drawer that put the Crew review pool one click away. */

import { useEffect, useRef, useSyncExternalStore, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { CrewReviewPanel } from './CrewReviewPanel.tsx'

/** Open/closed state shared by the footer action and the overlay drawer. */
export class CrewReviewDrawerController {
  private open = false
  private readonly listeners = new Set<() => void>()
  /** Element focused again when the drawer closes. */
  public returnTarget: HTMLElement | undefined

  /** @returns Whether the drawer is open. */
  public getSnapshot(): boolean { return this.open }
  public subscribe(listener: () => void): () => void { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  public show(): void { this.set(true) }
  public close(): void { this.set(false) }
  public dispose(): void { this.set(false); this.listeners.clear() }
  private set(open: boolean): void {
    if (this.open === open) return
    this.open = open
    for (const listener of this.listeners) listener()
  }
}

type TriggerProps = { readonly wide: boolean; readonly controller: CrewReviewDrawerController }
type OverlayProps = { readonly controller: CrewReviewDrawerController }

/** Render the Crew review action in the DSH sidebar footer. */
export function CrewReviewTrigger({ wide, controller }: TriggerProps): ReactNode {
  const open = useOpen(controller)
  const show = (event: ReactMouseEvent<HTMLButtonElement>): void => { controller.returnTarget = event.currentTarget; controller.show() }
  return <button type="button" className="dshCrewSessionsTrigger" aria-label="Open Crew review" aria-haspopup="dialog" aria-expanded={open} onClick={show}>{wide ? 'Crew review' : 'Review'}</button>
}

/** Render the review pool in a drawer; the panel only polls while it is open. */
export function CrewReviewOverlay({ controller }: OverlayProps): ReactNode {
  const open = useOpen(controller)
  const drawer = useRef<HTMLElement>(null)
  const closeButton = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open || drawer.current === null) return
    closeButton.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault(); controller.close()
    }
    const target = drawer.current.ownerDocument
    target.addEventListener('keydown', onKeyDown)
    return () => { target.removeEventListener('keydown', onKeyDown); if (controller.returnTarget?.isConnected) controller.returnTarget.focus() }
  }, [controller, open])
  if (!open) return null
  return <div className="dshCrewSessionsOverlay" role="presentation"><section ref={drawer} className="dshCrewSessionsDrawer dshCrewReviewDrawer" role="dialog" aria-modal="false" aria-labelledby="dsh-crew-review-title" tabIndex={-1}>
    <header className="dshCrewSessionsHeader"><div><h2 id="dsh-crew-review-title">Crew review</h2><p>Reviewer pool, recent verdicts and failures, and a reviewer sandbox check.</p></div><button ref={closeButton} type="button" className="dshCrewSessionsButton" onClick={() => { controller.close() }}>Close</button></header>
    <div className="dshCrewReviewDrawerBody"><CrewReviewPanel /></div>
  </section></div>
}

function useOpen(controller: CrewReviewDrawerController): boolean { return useSyncExternalStore(listener => controller.subscribe(listener), () => controller.getSnapshot()) }
