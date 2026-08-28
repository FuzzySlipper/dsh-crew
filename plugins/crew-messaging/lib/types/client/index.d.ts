/** Browser half of the Crew messaging plugin. */
import { CrewCockpit } from './CrewCockpit.tsx';
import { CrewSessionWorkbenchController } from './CrewSessionWorkbench.ts';
import { CrewSessionWorkbenchOverlay, CrewSessionWorkbenchTrigger } from './CrewSessionWorkbenchView.tsx';
interface ClientContext {
    readonly logger: {
        warn(error: unknown): void;
    };
    effect(effect: () => (() => void) | Promise<() => void>, label: string): void;
    readonly slots: {
        inject(name: 'settings.section', factory: () => () => void): void;
        inject(name: 'sidebar.footer.action' | 'shell.overlay', factory: () => () => void): void;
        register(options: {
            name: 'settings.section';
            id: string;
            order: number;
            label: string;
        }, component: typeof CrewCockpit): () => void;
        register(options: {
            name: 'sidebar.footer.action';
            id: string;
            order: number;
            label: string;
            inject: () => {
                controller: CrewSessionWorkbenchController;
            };
        }, component: typeof CrewSessionWorkbenchTrigger): () => void;
        register(options: {
            name: 'shell.overlay';
            id: string;
            order: number;
            inject: () => {
                controller: CrewSessionWorkbenchController;
            };
        }, component: typeof CrewSessionWorkbenchOverlay): () => void;
    };
}
/** The services required to contribute a global Settings section. */
export declare const inject: string[];
/** Register independent messaging and review settings once the shell is present. */
export declare function apply(ctx: ClientContext): void;
export {};
//# sourceMappingURL=index.d.ts.map