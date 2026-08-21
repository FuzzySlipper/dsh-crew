/** Browser half of the Crew messaging plugin. */

import { CrewCockpit } from './CrewCockpit.tsx'

interface ClientContext {
  readonly slots: {
    inject(name: 'settings.section', factory: () => () => void): void
    register(options: { name: 'settings.section'; id: string; order: number; label: string }, component: typeof CrewCockpit): () => void
  }
}

/** The services required to contribute a global Settings section. */
export const inject = ['slots']

/** Register the read-only Crew cockpit once the Settings shell is present. */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'crew-messaging', order: 35, label: 'Crew',
  }, CrewCockpit))
}
