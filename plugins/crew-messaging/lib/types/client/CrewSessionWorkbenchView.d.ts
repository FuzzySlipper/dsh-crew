/** React views for the additive foreign-session drawer. */
import { type ReactNode } from 'react';
import { CrewSessionWorkbenchController } from './CrewSessionWorkbench.ts';
type TriggerProps = {
    readonly wide: boolean;
    readonly controller: CrewSessionWorkbenchController;
};
type OverlayProps = {
    readonly controller: CrewSessionWorkbenchController;
};
/** Render the Crew sessions action in the DSH sidebar footer. */
export declare function CrewSessionWorkbenchTrigger({ wide, controller }: TriggerProps): ReactNode;
/** Render the independent session browser and event timeline in the shell overlay. */
export declare function CrewSessionWorkbenchOverlay({ controller }: OverlayProps): ReactNode;
export {};
//# sourceMappingURL=CrewSessionWorkbenchView.d.ts.map