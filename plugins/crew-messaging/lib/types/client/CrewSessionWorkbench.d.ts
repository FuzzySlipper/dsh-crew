/** Framework-independent foreign-session workbench state and same-origin browser port. */
import type { CrewForeignSession, CrewForeignSessionEvent, CrewForeignSessionEventsSnapshot, CrewForeignSessionsSnapshot } from '../dashboard/types.ts';
export declare const CREW_SESSIONS_ENDPOINT = "/plugins/dsh-crew-messaging/sessions";
export declare const CREW_SESSION_EVENTS_ENDPOINT = "/plugins/dsh-crew-messaging/session-events";
export declare const CREW_SESSION_EVENTS_STREAM_ENDPOINT = "/plugins/dsh-crew-messaging/session-events/stream";
export declare const CREW_SESSION_PROMPT_ENDPOINT = "/plugins/dsh-crew-messaging/session-prompt";
export declare const CREW_CODEX_CREATE_ENDPOINT = "/plugins/dsh-crew-messaging/codex/create";
export declare const CREW_CODEX_INTERRUPT_ENDPOINT = "/plugins/dsh-crew-messaging/codex/interrupt";
export declare const CREW_CODEX_INTERACTIONS_ENDPOINT = "/plugins/dsh-crew-messaging/codex/interactions";
export declare const CREW_CODEX_RESPOND_ENDPOINT = "/plugins/dsh-crew-messaging/codex/respond";
export declare const CREW_CODEX_CAPABILITIES_ENDPOINT = "/plugins/dsh-crew-messaging/codex/capabilities";
export declare const CREW_SESSION_PROMPT_MAX_CHARS = 12000;
/** Minimal EventSource face so controller tests do not need a browser transport. */
export interface CrewEventSource {
    addEventListener(type: 'open' | 'error' | 'session_event', listener: EventListener): void;
    close(): void;
}
/** Closed operations the workbench needs from the plugin-owned host routes. */
export interface CrewSessionWorkbenchPort {
    listSessions(signal: AbortSignal): Promise<CrewForeignSessionsSnapshot>;
    listEvents(sessionId: string, cursor: number, signal: AbortSignal): Promise<CrewForeignSessionEventsSnapshot>;
    stream(sessionId: string, cursor: number): CrewEventSource;
    submit?(sessionId: string, text: string, operationId: string): Promise<{
        readonly messageId: string;
        readonly replayed: boolean;
    }>;
    controlCapabilities?(): Promise<readonly string[]>;
    create?(cwd: string, operationId: string): Promise<{
        readonly sessionId: string;
    }>;
    interrupt?(sessionId: string, turnId: string, operationId: string): Promise<void>;
    interactions?(sessionId: string, signal: AbortSignal): Promise<readonly CrewPendingInteraction[]>;
    respondInteraction?(sessionId: string, id: string, method: string, response: unknown): Promise<void>;
}
export interface CrewInteractionQuestion {
    readonly id: string;
    readonly header: string;
    readonly question: string;
    readonly sensitive: boolean;
    readonly options: readonly {
        readonly label: string;
        readonly description: string;
    }[];
}
export interface CrewPendingInteraction {
    readonly id: string;
    readonly sessionId: string;
    readonly kind: string;
    readonly prompt?: string;
    readonly allowedDecisions: readonly string[];
    readonly createdAt: string;
    readonly status: 'pending';
    readonly capability: 'respond-interactions';
    readonly questions: readonly CrewInteractionQuestion[];
    readonly permissions: readonly string[];
}
export type CrewSessionWorkbenchConnection = 'closed' | 'connecting' | 'open' | 'reconnecting' | 'error';
/** Complete render state for the independent, read-only foreign-session workbench. */
export interface CrewSessionWorkbenchState {
    readonly open: boolean;
    readonly loading: boolean;
    readonly sessions: readonly CrewForeignSession[];
    readonly selectedSessionId: string | undefined;
    readonly events: readonly CrewForeignSessionEvent[];
    readonly cursor: number;
    readonly connection: CrewSessionWorkbenchConnection;
    readonly error: string | undefined;
    readonly submitting: boolean;
    readonly submissionError: string | undefined;
    readonly interactions: readonly CrewPendingInteraction[];
    readonly controlCapabilities: readonly string[];
}
/**
 * Own selection fetches and one EventSource. Changing selection or disposing cancels both.
 */
export declare class CrewSessionWorkbenchController {
    private readonly port;
    private readonly report;
    private readonly operationId;
    private state;
    private readonly listeners;
    private source;
    private listAbort;
    private eventsAbort;
    private selectionGeneration;
    private disposed;
    private pendingSubmission;
    private pendingCreate;
    private creating;
    private interactionAbort;
    private interactionTimer;
    private interactionLoading;
    constructor(port: CrewSessionWorkbenchPort, report?: (error: unknown) => void, operationId?: () => string);
    /** @returns The immutable render snapshot. */
    getSnapshot(): CrewSessionWorkbenchState;
    /** @param listener Callback after a state transition. @returns Subscription disposer. */
    subscribe(listener: () => void): () => void;
    /** Open the drawer and refresh the known public sessions. */
    open(): Promise<void>;
    /** Close the drawer and release all selection-specific browser resources. */
    close(): void;
    /** Dispose the controller when the DSH client plugin fiber unloads. */
    dispose(): void;
    /** Reload the public session list and retain only a still-present selection. */
    refresh(): Promise<void>;
    /** Select one known session, load its bounded history, then follow its stream. */
    select(sessionId: string): Promise<void>;
    /** Submit one ordinary fabric prompt to the selected runtime-capable session. */
    submit(text: string): Promise<boolean>;
    /** Whether the selected public runtime session advertises queued prompt delivery. */
    canPrompt(sessionId: string): boolean;
    canInterrupt(sessionId: string): boolean;
    canRespond(sessionId: string): boolean;
    canCreate(): boolean;
    create(cwd: string): Promise<boolean>;
    interrupt(turnId: string): Promise<boolean>;
    respondInteraction(interaction: CrewPendingInteraction, decision: string, responseOverride?: unknown): Promise<boolean>;
    private reloadInteractions;
    private scheduleInteractions;
    private openStream;
    private stopSelection;
    private patch;
}
/** Build a browser port that keeps the fabric on the DSH host side of the connection. */
export declare function createCrewSessionWorkbenchPort(input?: {
    readonly fetch?: typeof fetch;
    readonly eventSource?: (url: string) => CrewEventSource;
}): CrewSessionWorkbenchPort;
/** Parse one named SSE data item and discard malformed or private upstream data. */
export declare function decodeCrewForeignSessionEvent(value: unknown): CrewForeignSessionEvent | undefined;
/** Parse explicit session list DTOs and ignore unknown upstream keys. */
export declare function decodeSessions(value: unknown): CrewForeignSessionsSnapshot | undefined;
/** Parse explicit event-history DTOs and ignore unknown upstream keys. */
export declare function decodeEvents(value: unknown): CrewForeignSessionEventsSnapshot | undefined;
//# sourceMappingURL=CrewSessionWorkbench.d.ts.map