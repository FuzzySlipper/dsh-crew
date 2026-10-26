/** Sidebar footer action and drawer that put the Crew review pool one click away. */
import { type ReactNode } from 'react';
/** Open/closed state shared by the footer action and the overlay drawer. */
export declare class CrewReviewDrawerController {
    private open;
    private readonly listeners;
    /** Element focused again when the drawer closes. */
    returnTarget: HTMLElement | undefined;
    /** @returns Whether the drawer is open. */
    getSnapshot(): boolean;
    subscribe(listener: () => void): () => void;
    show(): void;
    close(): void;
    dispose(): void;
    private set;
}
type TriggerProps = {
    readonly wide: boolean;
    readonly controller: CrewReviewDrawerController;
};
type OverlayProps = {
    readonly controller: CrewReviewDrawerController;
};
/** Render the Crew review action in the DSH sidebar footer. */
export declare function CrewReviewTrigger({ wide, controller }: TriggerProps): ReactNode;
/** Render the review pool in a drawer; the panel only polls while it is open. */
export declare function CrewReviewOverlay({ controller }: OverlayProps): ReactNode;
export {};
//# sourceMappingURL=CrewReviewDrawer.d.ts.map