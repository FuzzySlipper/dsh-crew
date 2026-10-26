/** Browser half of the Crew messaging plugin. */
import { CrewCockpit } from "./CrewCockpit.js";
import { CrewReviewDrawerController, CrewReviewOverlay, CrewReviewTrigger } from "./CrewReviewDrawer.js";
import { CrewSessionWorkbenchController, createCrewSessionWorkbenchPort } from "./CrewSessionWorkbench.js";
import { installCrewSessionWorkbenchStyle } from "./CrewSessionWorkbench.styles.js";
import { CrewSessionWorkbenchOverlay, CrewSessionWorkbenchTrigger } from "./CrewSessionWorkbenchView.js";
/** The services required to contribute a global Settings section. */
export const inject = ['slots'];
/** Register the messaging Settings section and the sidebar session and review drawers. */
export function apply(ctx) {
    ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section', id: 'crew-messaging', order: 35, label: 'Crew messaging',
    }, CrewCockpit));
    const controller = new CrewSessionWorkbenchController(createCrewSessionWorkbenchPort(), error => { ctx.logger.warn(error); });
    ctx.effect(() => {
        if (typeof document === 'undefined')
            return () => { controller.dispose(); };
        const releaseStyle = installCrewSessionWorkbenchStyle(document);
        return () => { releaseStyle(); controller.dispose(); };
    }, 'crew-messaging: foreign-session workbench lifecycle');
    const injected = () => ({ controller });
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action', id: 'crew-messaging-sessions', order: 35, label: 'Crew sessions', inject: injected,
    }, CrewSessionWorkbenchTrigger));
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay', id: 'crew-messaging-sessions', order: 35, inject: injected,
    }, CrewSessionWorkbenchOverlay));
    const review = new CrewReviewDrawerController();
    ctx.effect(() => () => { review.dispose(); }, 'crew-messaging: review drawer lifecycle');
    const reviewInjected = () => ({ controller: review });
    ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
        name: 'sidebar.footer.action', id: 'crew-review', order: 36, label: 'Crew review', inject: reviewInjected,
    }, CrewReviewTrigger));
    ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay', id: 'crew-review', order: 36, inject: reviewInjected,
    }, CrewReviewOverlay));
}
//# sourceMappingURL=index.js.map