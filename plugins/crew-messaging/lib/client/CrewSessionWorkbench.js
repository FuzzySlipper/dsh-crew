/** Framework-independent foreign-session workbench state and same-origin browser port. */
export const CREW_SESSIONS_ENDPOINT = '/plugins/dsh-crew-messaging/sessions';
export const CREW_SESSION_EVENTS_ENDPOINT = '/plugins/dsh-crew-messaging/session-events';
export const CREW_SESSION_EVENTS_STREAM_ENDPOINT = '/plugins/dsh-crew-messaging/session-events/stream';
export const CREW_SESSION_PROMPT_ENDPOINT = '/plugins/dsh-crew-messaging/session-prompt';
export const CREW_WORKBENCH_INBOX_ENDPOINT = '/plugins/dsh-crew-messaging/workbench-inbox';
export const CREW_CODEX_CREATE_ENDPOINT = '/plugins/dsh-crew-messaging/codex/create';
export const CREW_CODEX_INTERRUPT_ENDPOINT = '/plugins/dsh-crew-messaging/codex/interrupt';
export const CREW_CODEX_INTERACTIONS_ENDPOINT = '/plugins/dsh-crew-messaging/codex/interactions';
export const CREW_CODEX_RESPOND_ENDPOINT = '/plugins/dsh-crew-messaging/codex/respond';
export const CREW_CODEX_CAPABILITIES_ENDPOINT = '/plugins/dsh-crew-messaging/codex/capabilities';
export const CREW_SESSION_PROMPT_MAX_CHARS = 12_000;
const INITIAL = {
    open: false, loading: false, sessions: [], selectedSessionId: undefined, events: [], cursor: 0, connection: 'closed', error: undefined, submitting: false, submissionError: undefined, interactions: [], controlCapabilities: [], inbox: [], inboxLoading: false, inboxError: undefined,
};
/**
 * Own selection fetches and one EventSource. Changing selection or disposing cancels both.
 */
export class CrewSessionWorkbenchController {
    port;
    report;
    operationId;
    state = INITIAL;
    listeners = new Set();
    source;
    listAbort;
    eventsAbort;
    selectionGeneration = 0;
    disposed = false;
    pendingSubmission;
    pendingCreate;
    creating = false;
    interactionAbort;
    interactionTimer;
    interactionLoading = false;
    inboxAbort;
    inboxTimer;
    inboxGeneration = 0;
    constructor(port, report = () => { }, operationId = () => crypto.randomUUID()) {
        this.port = port;
        this.report = report;
        this.operationId = operationId;
    }
    /** @returns The immutable render snapshot. */
    getSnapshot() { return this.state; }
    /** @param listener Callback after a state transition. @returns Subscription disposer. */
    subscribe(listener) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
    /** Open the drawer and refresh the known public sessions. */
    async open() { if (this.disposed)
        return; this.patch({ open: true }); await this.refresh(); this.scheduleInbox(); }
    /** Close the drawer and release all selection-specific browser resources. */
    close() {
        this.listAbort?.abort();
        this.listAbort = undefined;
        this.inboxGeneration += 1;
        this.inboxAbort?.abort();
        this.inboxAbort = undefined;
        if (this.inboxTimer !== undefined)
            clearTimeout(this.inboxTimer);
        this.inboxTimer = undefined;
        this.selectionGeneration += 1;
        this.stopSelection();
        this.patch({ open: false, loading: false, selectedSessionId: undefined, events: [], cursor: 0, connection: 'closed', error: undefined, submitting: false, submissionError: undefined, interactions: [], controlCapabilities: [], inbox: [], inboxLoading: false, inboxError: undefined });
    }
    /** Dispose the controller when the DSH client plugin fiber unloads. */
    dispose() { if (this.disposed)
        return; this.disposed = true; this.close(); this.listeners.clear(); }
    /** Reload the public session list and retain only a still-present selection. */
    async refresh() {
        if (this.disposed || !this.state.open)
            return;
        const inbox = this.reloadInbox();
        this.listAbort?.abort();
        const controller = new AbortController();
        this.listAbort = controller;
        this.patch({ loading: true, error: undefined });
        try {
            const snapshot = await this.port.listSessions(controller.signal);
            if (this.disposed || !this.state.open || controller.signal.aborted || this.listAbort !== controller)
                return;
            const current = this.state.selectedSessionId;
            const selected = current !== undefined && snapshot.sessions.some(session => session.sessionId === current) ? current : snapshot.sessions[0]?.sessionId;
            let controlCapabilities = [];
            try {
                controlCapabilities = await this.port.controlCapabilities?.() ?? [];
            }
            catch { /* controls stay absent when the sidecar is offline */ }
            if (controller.signal.aborted || this.listAbort !== controller)
                return;
            this.patch({ sessions: snapshot.sessions, loading: false, controlCapabilities });
            if (selected === undefined) {
                this.selectionGeneration += 1;
                this.stopSelection();
                this.patch({ selectedSessionId: undefined, events: [], cursor: 0, connection: 'closed' });
                await inbox;
                return;
            }
            if (selected !== current || this.state.events.length === 0)
                await this.select(selected);
            await inbox;
        }
        catch (error) {
            if (controller.signal.aborted)
                return;
            await inbox;
            this.report(error);
            this.patch({ loading: false, error: message(error), connection: this.state.selectedSessionId === undefined ? 'error' : this.state.connection });
        }
    }
    /** Select one known session, load its bounded history, then follow its stream. */
    async select(sessionId) {
        if (this.disposed || !this.state.open || !this.state.sessions.some(session => session.sessionId === sessionId))
            return;
        const generation = ++this.selectionGeneration;
        this.stopSelection();
        const controller = new AbortController();
        this.eventsAbort = controller;
        this.patch({ selectedSessionId: sessionId, events: [], cursor: 0, connection: 'connecting', error: undefined });
        try {
            const history = await this.port.listEvents(sessionId, 0, controller.signal);
            if (controller.signal.aborted || generation !== this.selectionGeneration)
                return;
            const merged = mergeEvents([], history.events);
            const cursor = latestCursor(merged);
            this.patch({ events: merged, cursor });
            await this.reloadInteractions(sessionId, generation);
            this.scheduleInteractions(sessionId, generation);
            this.openStream(sessionId, cursor, generation);
        }
        catch (error) {
            if (controller.signal.aborted || generation !== this.selectionGeneration)
                return;
            this.report(error);
            this.patch({ connection: 'error', error: message(error) });
        }
    }
    /** Submit one ordinary fabric prompt to the selected runtime-capable session. */
    async submit(text) {
        const sessionId = this.state.selectedSessionId;
        if (this.disposed || !this.state.open || this.state.submitting || this.port.submit === undefined || sessionId === undefined || !this.canPrompt(sessionId) || text.trim() === '')
            return false;
        if (text.length > CREW_SESSION_PROMPT_MAX_CHARS) {
            this.patch({ submissionError: 'Prompt must be 12,000 characters or fewer' });
            return false;
        }
        const pending = this.pendingSubmission?.sessionId === sessionId && this.pendingSubmission.text === text
            ? this.pendingSubmission
            : { sessionId, text, operationId: this.operationId() };
        this.pendingSubmission = pending;
        this.patch({ submitting: true, submissionError: undefined });
        try {
            await this.port.submit(pending.sessionId, pending.text, pending.operationId);
            if (!this.disposed)
                this.patch({ submitting: false, submissionError: undefined });
            this.pendingSubmission = undefined;
            return true;
        }
        catch (error) {
            if (!this.disposed) {
                this.report(error);
                this.patch({ submitting: false, submissionError: message(error) });
            }
            return false;
        }
    }
    /** Whether the selected public runtime session advertises queued prompt delivery. */
    canPrompt(sessionId) { return this.state.sessions.some(session => session.sessionId === sessionId && session.capabilities.includes('queued-prompt-delivery')); }
    canInterrupt(sessionId) { return this.state.sessions.some(session => session.sessionId === sessionId && session.capabilities.includes('interrupt-native-turn')); }
    canRespond(sessionId) { return this.state.sessions.some(session => session.sessionId === sessionId && session.capabilities.includes('respond-interactions')); }
    canCreate() { return this.state.controlCapabilities.includes('create-codex-session'); }
    async create(cwd) { if (this.port.create === undefined || this.disposed || this.creating || !this.canCreate())
        return false; const pending = this.pendingCreate?.cwd === cwd ? this.pendingCreate : { cwd, operationId: this.operationId() }; this.pendingCreate = pending; this.creating = true; try {
        await this.port.create(pending.cwd, pending.operationId);
        this.pendingCreate = undefined;
        await this.refresh();
        return true;
    }
    catch (error) {
        this.report(error);
        this.patch({ error: message(error) });
        return false;
    }
    finally {
        this.creating = false;
    } }
    async interrupt(turnId) { const sessionId = this.state.selectedSessionId; if (this.port.interrupt === undefined || sessionId === undefined || this.disposed || !this.canInterrupt(sessionId))
        return false; try {
        await this.port.interrupt(sessionId, turnId, this.operationId());
        return true;
    }
    catch (error) {
        this.report(error);
        this.patch({ error: message(error) });
        return false;
    } }
    async respondInteraction(interaction, decision, responseOverride) { if (this.port.respondInteraction === undefined || interaction.sessionId !== this.state.selectedSessionId || !this.canRespond(interaction.sessionId))
        return false; const response = responseOverride ?? interactionResponse(interaction.kind, decision); if (response === undefined)
        return false; try {
        await this.port.respondInteraction(interaction.sessionId, interaction.id, interaction.kind, response);
        await this.reloadInteractions(interaction.sessionId, this.selectionGeneration);
        return true;
    }
    catch (error) {
        this.report(error);
        this.patch({ error: message(error) });
        return false;
    } }
    async reloadInteractions(sessionId, generation) { if (this.port.interactions === undefined || !this.canRespond(sessionId) || this.interactionLoading)
        return; this.interactionAbort?.abort(); const controller = new AbortController(); this.interactionAbort = controller; this.interactionLoading = true; try {
        const interactions = await this.port.interactions(sessionId, controller.signal);
        if (!this.disposed && !controller.signal.aborted && generation === this.selectionGeneration && sessionId === this.state.selectedSessionId)
            this.patch({ interactions });
    }
    catch (error) {
        if (!controller.signal.aborted && generation === this.selectionGeneration)
            this.report(error);
    }
    finally {
        if (this.interactionAbort === controller)
            this.interactionAbort = undefined;
        this.interactionLoading = false;
    } }
    scheduleInteractions(sessionId, generation) { if (this.disposed || generation !== this.selectionGeneration || !this.state.open || !this.canRespond(sessionId))
        return; this.interactionTimer = setTimeout(async () => { this.interactionTimer = undefined; await this.reloadInteractions(sessionId, generation); this.scheduleInteractions(sessionId, generation); }, 1_000); }
    /** Poll the durable workbench mailbox only while its drawer is visible. */
    async reloadInbox() {
        if (this.port.listInbox === undefined || this.disposed || !this.state.open)
            return;
        this.inboxAbort?.abort();
        const controller = new AbortController();
        this.inboxAbort = controller;
        const generation = this.inboxGeneration;
        this.patch({ inboxLoading: true, inboxError: undefined });
        try {
            const snapshot = await this.port.listInbox(controller.signal);
            if (!this.disposed && this.state.open && !controller.signal.aborted && this.inboxAbort === controller && generation === this.inboxGeneration)
                this.patch({ inbox: snapshot.messages, inboxLoading: false });
        }
        catch (error) {
            if (!controller.signal.aborted && !this.disposed && this.state.open && this.inboxAbort === controller && generation === this.inboxGeneration) {
                this.report(error);
                this.patch({ inboxLoading: false, inboxError: message(error) });
            }
        }
        finally {
            if (this.inboxAbort === controller)
                this.inboxAbort = undefined;
        }
    }
    scheduleInbox() {
        if (this.disposed || !this.state.open || this.port.listInbox === undefined || this.inboxTimer !== undefined)
            return;
        const generation = this.inboxGeneration;
        this.inboxTimer = setTimeout(async () => { this.inboxTimer = undefined; if (generation !== this.inboxGeneration)
            return; await this.reloadInbox(); this.scheduleInbox(); }, 3_000);
    }
    openStream(sessionId, cursor, generation) {
        const source = this.port.stream(sessionId, cursor);
        this.source = source;
        source.addEventListener('open', () => {
            if (!this.disposed && this.source === source && generation === this.selectionGeneration)
                this.patch({ connection: 'open', error: undefined });
        });
        source.addEventListener('error', () => {
            if (!this.disposed && this.source === source && generation === this.selectionGeneration)
                this.patch({ connection: 'reconnecting' });
        });
        source.addEventListener('session_event', event => {
            if (this.disposed || this.source !== source || generation !== this.selectionGeneration)
                return;
            const decoded = decodeCrewForeignSessionEvent(event.data);
            if (decoded === undefined || decoded.sessionId !== sessionId || decoded.cursor <= this.state.cursor)
                return;
            const events = mergeEvents(this.state.events, [decoded]);
            this.patch({ events, cursor: latestCursor(events) });
        });
    }
    stopSelection() { this.source?.close(); this.source = undefined; this.eventsAbort?.abort(); this.eventsAbort = undefined; this.interactionAbort?.abort(); this.interactionAbort = undefined; if (this.interactionTimer !== undefined)
        clearTimeout(this.interactionTimer); this.interactionTimer = undefined; this.interactionLoading = false; }
    patch(patch) {
        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners)
            listener();
    }
}
/** Build a browser port that keeps the fabric on the DSH host side of the connection. */
export function createCrewSessionWorkbenchPort(input = {}) {
    const request = input.fetch ?? fetch;
    const eventSource = input.eventSource ?? (url => new EventSource(url));
    return {
        listSessions: async (signal) => decodeSnapshot(await fetchJson(request, CREW_SESSIONS_ENDPOINT, signal), decodeSessions),
        listEvents: async (sessionId, cursor, signal) => decodeSnapshot(await fetchJson(request, `${CREW_SESSION_EVENTS_ENDPOINT}?${new URLSearchParams({ session_id: sessionId, cursor: String(cursor) })}`, signal), decodeEvents),
        listInbox: async (signal) => decodeSnapshot(await fetchJson(request, CREW_WORKBENCH_INBOX_ENDPOINT, signal), decodeInbox),
        stream: (sessionId, cursor) => eventSource(`${CREW_SESSION_EVENTS_STREAM_ENDPOINT}?${new URLSearchParams({ session_id: sessionId, cursor: String(cursor) })}`),
        submit: async (sessionId, text, operationId) => decodeSubmission(await fetchJson(request, CREW_SESSION_PROMPT_ENDPOINT, undefined, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, text, operation_id: operationId }) })),
        controlCapabilities: async () => { const value = object(await fetchJson(request, CREW_CODEX_CAPABILITIES_ENDPOINT)); const capabilities = Array.isArray(value?.capabilities) && value.capabilities.every(item => typeof item === 'string') ? value.capabilities : undefined; if (capabilities === undefined)
            throw new Error('received invalid Codex capabilities'); return capabilities; },
        create: async (cwd, operationId) => { const value = object(await fetchJson(request, CREW_CODEX_CREATE_ENDPOINT, undefined, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cwd, operation_id: operationId }) })); const sessionId = text(value?.sessionId); if (sessionId === undefined)
            throw new Error('received an invalid Codex create response'); return { sessionId }; },
        interrupt: async (sessionId, turnId, operationId) => { await fetchJson(request, CREW_CODEX_INTERRUPT_ENDPOINT, undefined, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, turn_id: turnId, operation_id: operationId }) }); },
        interactions: async (sessionId, signal) => { const value = object(await fetchJson(request, `${CREW_CODEX_INTERACTIONS_ENDPOINT}?${new URLSearchParams({ session_id: sessionId })}`, signal)); const values = Array.isArray(value?.interactions) ? value.interactions.map(decodeInteraction) : undefined; if (values === undefined || values.some(item => item === undefined))
            throw new Error('received an invalid Codex interaction response'); return values; },
        respondInteraction: async (sessionId, id, method, response) => { await fetchJson(request, CREW_CODEX_RESPOND_ENDPOINT, undefined, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ session_id: sessionId, id, method, response }) }); },
    };
}
/** Parse one named SSE data item and discard malformed or private upstream data. */
export function decodeCrewForeignSessionEvent(value) {
    let parsed = value;
    if (typeof value === 'string') {
        try {
            parsed = JSON.parse(value);
        }
        catch {
            return undefined;
        }
    }
    return decodeEvent(parsed);
}
/** Parse explicit session list DTOs and ignore unknown upstream keys. */
export function decodeSessions(value) {
    const record = object(value);
    if (!Array.isArray(record?.sessions))
        return undefined;
    const sessions = record.sessions.map(decodeSession);
    return sessions.some(session => session === undefined) ? undefined : { sessions: sessions };
}
/** Parse explicit event-history DTOs and ignore unknown upstream keys. */
export function decodeEvents(value) {
    const record = object(value);
    if (!Array.isArray(record?.events))
        return undefined;
    const events = record.events.map(decodeEvent);
    return events.some(event => event === undefined) ? undefined : { events: events };
}
/** Parse an explicit workbench mailbox response and discard unknown server fields. */
export function decodeInbox(value) {
    const record = object(value);
    if (!Array.isArray(record?.messages))
        return undefined;
    const messages = record.messages.map(item => {
        const entry = object(item);
        const messageId = text(entry?.messageId);
        const deliveryId = text(entry?.deliveryId);
        const state = text(entry?.state);
        const sender = text(entry?.sender);
        const body = text(entry?.body);
        const createdAt = text(entry?.createdAt);
        const replyToMessageId = text(entry?.replyToMessageId);
        return messageId === undefined || deliveryId === undefined || state === undefined || sender === undefined || body === undefined || createdAt === undefined ? undefined : { messageId, deliveryId, state, sender, body, createdAt, ...(replyToMessageId === undefined ? {} : { replyToMessageId }) };
    });
    return messages.some(item => item === undefined) ? undefined : { messages: messages };
}
async function fetchJson(request, url, signal, init = {}) {
    const response = await request(url, { cache: 'no-store', ...init, ...(signal === undefined ? {} : { signal }) });
    if (!response.ok)
        throw new Error(`request failed (${String(response.status)})`);
    return await response.json();
}
function decodeSnapshot(value, decoder) { const decoded = decoder(value); if (decoded === undefined)
    throw new Error('received an invalid Crew session response'); return decoded; }
function decodeSubmission(value) {
    const record = object(value);
    const messageId = text(record?.messageId);
    const replayed = record?.replayed;
    if (messageId === undefined || typeof replayed !== 'boolean')
        throw new Error('received an invalid Crew prompt response');
    return { messageId, replayed };
}
function decodeInteraction(value) { const record = object(value); const id = text(record?.id); const sessionId = text(record?.session_id); const kind = text(record?.kind); const createdAt = text(record?.created_at); const status = text(record?.status); const capability = text(record?.capability); const allowedDecisions = Array.isArray(record?.allowed_decisions) && record.allowed_decisions.every(item => typeof item === 'string') ? record.allowed_decisions : undefined; const prompt = text(record?.prompt); const questions = Array.isArray(record?.questions) ? record.questions.map(decodeQuestion) : []; const permissions = record?.permissions === undefined ? [] : Array.isArray(record.permissions) && record.permissions.every(item => typeof item === 'string') ? record.permissions : undefined; if (id === undefined || sessionId === undefined || kind === undefined || createdAt === undefined || status !== 'pending' || capability !== 'respond-interactions' || allowedDecisions === undefined || questions.some(question => question === undefined) || permissions === undefined)
    return undefined; return { id, sessionId, kind, createdAt, status, capability, allowedDecisions, questions: questions, permissions, ...(prompt === undefined ? {} : { prompt }) }; }
function decodeQuestion(value) { const record = object(value); const id = text(record?.id); const header = text(record?.header); const question = text(record?.question); const sensitive = record?.sensitive === true; const options = Array.isArray(record?.options) ? record.options.map(option => { const item = object(option); const label = text(item?.label); const description = text(item?.description); return label === undefined || description === undefined ? undefined : { label, description }; }) : []; if (id === undefined || header === undefined || question === undefined || options.some(option => option === undefined))
    return undefined; return { id, header, question, sensitive, options: options }; }
function interactionResponse(kind, decision) { if ((kind === 'item/commandExecution/requestApproval' || kind === 'item/fileChange/requestApproval') && (decision === 'accept' || decision === 'decline' || decision === 'cancel'))
    return { decision }; if (kind === 'item/permissions/requestApproval' && decision === 'deny')
    return { permissions: {}, scope: 'turn' }; if (kind === 'item/tool/requestUserInput' && decision === 'submit-empty')
    return { answers: {} }; if (kind === 'mcpServer/elicitation/request' && (decision === 'decline' || decision === 'cancel'))
    return { action: decision, content: null }; return undefined; }
function decodeSession(value) {
    const record = object(value);
    const sessionId = text(record?.sessionId);
    const adapterId = text(record?.adapterId);
    const label = text(record?.label);
    const status = text(record?.status);
    const revision = integer(record?.revision);
    const createdAt = text(record?.createdAt);
    const updatedAt = text(record?.updatedAt);
    const location = text(record?.location);
    const capabilities = Array.isArray(record?.capabilities) && record.capabilities.every(item => typeof item === 'string') ? record.capabilities : undefined;
    if (sessionId === undefined || adapterId === undefined || label === undefined || status === undefined || revision === undefined || createdAt === undefined || updatedAt === undefined || capabilities === undefined)
        return undefined;
    return { sessionId, adapterId, label, status, capabilities, revision, createdAt, updatedAt, ...(location === undefined ? {} : { location }) };
}
function decodeEvent(value) {
    const record = object(value);
    const eventId = text(field(record, 'eventId', 'event_id'));
    const sessionId = text(field(record, 'sessionId', 'session_id'));
    const sequence = integer(record?.sequence);
    const cursor = integer(record?.cursor);
    const eventType = text(field(record, 'eventType', 'event_type'));
    const occurredAt = text(field(record, 'occurredAt', 'occurred_at'));
    const recordedAt = text(field(record, 'recordedAt', 'recorded_at'));
    if (eventId === undefined || sessionId === undefined || sequence === undefined || cursor === undefined || eventType === undefined || occurredAt === undefined || recordedAt === undefined || !('payload' in (record ?? {})))
        return undefined;
    const payload = safePayload(record.payload);
    return payload === undefined ? undefined : { eventId, sessionId, sequence, cursor, eventType, payload, occurredAt, recordedAt };
}
function mergeEvents(existing, incoming) {
    const byCursor = new Map(existing.map(event => [event.cursor, event]));
    for (const event of incoming)
        if (!byCursor.has(event.cursor))
            byCursor.set(event.cursor, event);
    return [...byCursor.values()].sort((left, right) => left.cursor - right.cursor);
}
function latestCursor(events) { return events.at(-1)?.cursor ?? 0; }
function object(value) { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined; }
function field(record, camel, snake) { return record?.[camel] ?? record?.[snake]; }
function text(value) { return typeof value === 'string' ? value : undefined; }
function integer(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined; }
function message(error) { return error instanceof Error ? error.message : 'Crew session request failed'; }
function safePayload(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : undefined;
    if (Array.isArray(value)) {
        const items = value.map(safePayload);
        return items.some(item => item === undefined) ? undefined : items;
    }
    const record = object(value);
    if (record === undefined)
        return undefined;
    const projected = {};
    for (const [key, entry] of Object.entries(record)) {
        if (key === 'adapter_key' || key === 'target_ref' || key === 'lease_token' || key.endsWith('_token'))
            continue;
        const nested = safePayload(entry);
        if (nested === undefined)
            return undefined;
        projected[key] = nested;
    }
    return projected;
}
//# sourceMappingURL=CrewSessionWorkbench.js.map