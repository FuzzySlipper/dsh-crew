import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** React views for the additive foreign-session drawer. */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CREW_SESSION_PROMPT_MAX_CHARS } from "./CrewSessionWorkbench.js";
const returnTargets = new WeakMap();
/** Render the Crew sessions action in the DSH sidebar footer. */
export function CrewSessionWorkbenchTrigger({ wide, controller }) {
    const state = useStore(controller);
    const open = (event) => { returnTargets.set(controller, event.currentTarget); void controller.open(); };
    return _jsx("button", { type: "button", className: "dshCrewSessionsTrigger", "aria-label": "Open Crew sessions", "aria-haspopup": "dialog", "aria-expanded": state.open, onClick: open, children: wide ? 'Crew sessions' : 'Crew' });
}
/** Render the independent session browser and event timeline in the shell overlay. */
export function CrewSessionWorkbenchOverlay({ controller }) {
    const state = useStore(controller);
    const drawer = useRef(null);
    const closeButton = useRef(null);
    useEffect(() => {
        if (!state.open || drawer.current === null)
            return;
        closeButton.current?.focus();
        const onKeyDown = (event) => {
            if (event.key !== 'Escape')
                return;
            event.preventDefault();
            controller.close();
        };
        const target = drawer.current.ownerDocument;
        target.addEventListener('keydown', onKeyDown);
        return () => { target.removeEventListener('keydown', onKeyDown); const trigger = returnTargets.get(controller); if (trigger?.isConnected)
            trigger.focus(); };
    }, [controller, state.open]);
    if (!state.open)
        return null;
    const selected = state.sessions.find(session => session.sessionId === state.selectedSessionId);
    return _jsx("div", { className: "dshCrewSessionsOverlay", role: "presentation", children: _jsxs("section", { ref: drawer, className: "dshCrewSessionsDrawer", role: "dialog", "aria-modal": "false", "aria-labelledby": "dsh-crew-sessions-title", tabIndex: -1, children: [_jsxs("header", { className: "dshCrewSessionsHeader", children: [_jsxs("div", { children: [_jsx("h2", { id: "dsh-crew-sessions-title", children: "Crew sessions" }), _jsx("p", { children: "Sessions published by external runtime adapters." })] }), _jsx("button", { ref: closeButton, type: "button", className: "dshCrewSessionsButton", onClick: () => controller.close(), children: "Close" })] }), _jsxs("div", { className: "dshCrewSessionsGrid", children: [_jsx("nav", { className: "dshCrewSessionList", "aria-label": "Crew sessions", children: state.loading ? _jsx("p", { className: "dshCrewSessionsEmpty", children: "Loading sessions\u2026" }) : state.sessions.length === 0 ? _jsx("p", { className: "dshCrewSessionsEmpty", children: "No external sessions are currently published." }) : state.sessions.map(session => _jsxs("button", { type: "button", "aria-current": session.sessionId === state.selectedSessionId || undefined, onClick: () => { void controller.select(session.sessionId); }, children: [_jsx("strong", { children: session.label }), _jsxs("small", { children: [session.adapterId, " \u00B7 ", session.status, session.location === undefined ? '' : ` · ${session.location}`] })] }, session.sessionId)) }), _jsxs("section", { className: "dshCrewSessionTimeline", "aria-live": "polite", children: [_jsxs("header", { className: "dshCrewSessionsToolbar", children: [_jsxs("div", { children: [_jsx("strong", { children: selected?.label ?? 'Select a session' }), _jsx("div", { className: "dshCrewSessionsMuted", children: selected === undefined ? 'No session selected' : selected.capabilities.join(', ') || 'No published capabilities' })] }), _jsxs("div", { children: [_jsx("span", { className: "dshCrewSessionsState", "data-state": state.connection, children: state.connection }), " ", _jsx("button", { type: "button", className: "dshCrewSessionsButton", onClick: () => { void controller.refresh(); }, children: "Refresh" })] })] }), _jsx(CrewPrompt, { controller: controller, enabled: selected !== undefined && controller.canPrompt(selected.sessionId) }), _jsxs("div", { className: "dshCrewSessionEvents", children: [state.error === undefined ? null : _jsx("p", { className: "dshCrewSessionsEmpty", role: "status", children: state.error }), selected === undefined ? _jsx("p", { className: "dshCrewSessionsEmpty", children: "Choose a published session to inspect its timeline." }) : state.events.length === 0 && state.connection === 'connecting' ? _jsx("p", { className: "dshCrewSessionsEmpty", children: "Loading event history\u2026" }) : state.events.length === 0 ? _jsx("p", { className: "dshCrewSessionsEmpty", children: "No events have been published for this session." }) : state.events.map(event => _jsx(EventRow, { event: event }, event.cursor))] })] })] })] }) });
}
function CrewPrompt({ controller, enabled }) {
    const state = useStore(controller);
    const [text, setText] = useState('');
    if (!enabled)
        return _jsx("p", { className: "dshCrewSessionsMuted", children: "This runtime publishes history only; it cannot accept workbench prompts." });
    const submit = async (event) => {
        event.preventDefault();
        if (await controller.submit(text))
            setText('');
    };
    return _jsxs("form", { className: "dshCrewSessionPrompt", onSubmit: event => { void submit(event); }, children: [_jsx("label", { htmlFor: "dsh-crew-session-prompt", children: "Send a queued prompt" }), _jsx("textarea", { id: "dsh-crew-session-prompt", maxLength: CREW_SESSION_PROMPT_MAX_CHARS, value: text, onChange: event => setText(event.target.value), disabled: state.submitting }), _jsxs("div", { children: [_jsx("button", { type: "submit", className: "dshCrewSessionsButton", disabled: state.submitting || text.trim() === '', children: state.submitting ? 'Submitting…' : 'Queue prompt' }), state.submissionError === undefined ? null : _jsx("span", { className: "dshCrewSessionsError", role: "status", children: state.submissionError })] })] });
}
function EventRow({ event }) {
    return _jsxs("article", { className: "dshCrewSessionEvent", children: [_jsxs("header", { children: [_jsx("strong", { children: event.eventType }), _jsx("time", { dateTime: event.occurredAt, children: event.occurredAt })] }), _jsx("pre", { children: formatPayload(event.payload) }), _jsxs("small", { children: ["#", event.cursor, " \u00B7 ", event.eventId] })] });
}
function useStore(controller) { return useSyncExternalStore(listener => controller.subscribe(listener), () => controller.getSnapshot()); }
function formatPayload(value) { try {
    return JSON.stringify(value, null, 2);
}
catch {
    return String(value);
} }
//# sourceMappingURL=CrewSessionWorkbenchView.js.map