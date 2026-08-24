/** Browser half of the Crew messaging plugin. */

import { CrewCockpit } from './CrewCockpit.tsx'
import { CrewSessionWorkbenchController, createCrewSessionWorkbenchPort } from './CrewSessionWorkbench.ts'
import { installCrewSessionWorkbenchStyle } from './CrewSessionWorkbench.styles.ts'
import { CrewSessionWorkbenchOverlay, CrewSessionWorkbenchTrigger } from './CrewSessionWorkbenchView.tsx'

interface ClientContext {
  readonly logger: { warn(error: unknown): void }
  effect(effect: () => (() => void) | Promise<() => void>, label: string): void
  readonly slots: {
    inject(name: 'settings.section', factory: () => () => void): void
    inject(name: 'sidebar.footer.action' | 'shell.overlay', factory: () => () => void): void
    register(options: { name: 'settings.section'; id: string; order: number; label: string }, component: typeof CrewCockpit): () => void
    register(options: { name: 'sidebar.footer.action'; id: string; order: number; label: string; inject: () => { controller: CrewSessionWorkbenchController } }, component: typeof CrewSessionWorkbenchTrigger): () => void
    register(options: { name: 'shell.overlay'; id: string; order: number; inject: () => { controller: CrewSessionWorkbenchController } }, component: typeof CrewSessionWorkbenchOverlay): () => void
  }
}

/** The services required to contribute a global Settings section. */
export const inject = ['slots']

/** Register the read-only Crew cockpit once the Settings shell is present. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'crew-messaging', order: 35, label: 'Crew',
  }, CrewCockpit))
  const controller = new CrewSessionWorkbenchController(createCrewSessionWorkbenchPort(), error => { ctx.logger.warn(error) })
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => { controller.dispose() }
    const releaseStyle = installCrewSessionWorkbenchStyle(document)
    return () => { releaseStyle(); controller.dispose() }
  }, 'crew-messaging: foreign-session workbench lifecycle')
  const injected = (): { controller: CrewSessionWorkbenchController } => ({ controller })
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'crew-messaging-sessions', order: 35, label: 'Crew sessions', inject: injected,
  }, CrewSessionWorkbenchTrigger))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'crew-messaging-sessions', order: 35, inject: injected,
  }, CrewSessionWorkbenchOverlay))
}
