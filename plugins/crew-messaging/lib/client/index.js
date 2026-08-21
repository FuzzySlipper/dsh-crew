/** Browser half of the Crew messaging plugin. */
import { CrewCockpit } from "./CrewCockpit.js";
/** The services required to contribute a global Settings section. */
export const inject = ['slots'];
/** Register the read-only Crew cockpit once the Settings shell is present. */
export function apply(ctx) {
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'crew-messaging', order: 35, label: 'Crew',
    }, CrewCockpit));
}
//# sourceMappingURL=index.js.map