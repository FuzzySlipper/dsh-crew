import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Read-only global Crew settings cockpit. */
import { useEffect, useState } from 'react';
import css from "./CrewCockpit.styles.js";
export const CREW_DASHBOARD_ENDPOINT = '/plugins/dsh-crew-messaging/dashboard';
const POLL_MS = 5_000;
/** Decode the narrow response the Host projection owns. */
export function decodeCrewDashboard(value) {
    if (!isObject(value) || !isObject(value.fabric) || !isObject(value.adapter) || !isObject(value.tuning)
        || !Array.isArray(value.directory) || !Array.isArray(value.messages) || !Array.isArray(value.deliveries))
        return undefined;
    const fabric = value.fabric;
    const adapter = value.adapter;
    const tuning = value.tuning;
    if (typeof fabric.ready !== 'boolean' || typeof fabric.status !== 'string'
        || typeof adapter.initialized !== 'boolean' || typeof adapter.stopped !== 'boolean' || typeof adapter.connected !== 'boolean' || (adapter.leaseExpiresAt !== undefined && typeof adapter.leaseExpiresAt !== 'string')
        || !tuningValid(tuning))
        return undefined;
    const directory = value.directory.flatMap(directoryEntry);
    const messages = value.messages.flatMap(messageSummary);
    const deliveries = value.deliveries.flatMap(deliverySummary);
    if (directory.length !== value.directory.length || messages.length !== value.messages.length || deliveries.length !== value.deliveries.length)
        return undefined;
    return {
        fabric: { ready: fabric.ready, status: fabric.status },
        adapter: { initialized: adapter.initialized, stopped: adapter.stopped, connected: adapter.connected, ...(adapter.leaseExpiresAt === undefined ? {} : { leaseExpiresAt: adapter.leaseExpiresAt }) },
        directory, tuning: {
            leaseDuration: tuning.leaseDuration, renewMs: tuning.renewMs, pollMs: tuning.pollMs, claimDuration: tuning.claimDuration,
            ttl: tuning.ttl, acceptanceTimeoutMs: tuning.acceptanceTimeoutMs, acceptancePollMs: tuning.acceptancePollMs,
        }, messages, deliveries,
    };
}
/** Render the v1 Crew global settings page. */
export function CrewCockpit() {
    const [state, setState] = useState({ kind: 'loading' });
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const response = await fetch(CREW_DASHBOARD_ENDPOINT, { cache: 'no-store' });
                if (!response.ok)
                    throw new Error(`request failed (${String(response.status)})`);
                const snapshot = decodeCrewDashboard(await response.json());
                if (snapshot === undefined)
                    throw new Error('received an invalid dashboard response');
                if (active)
                    setState({ kind: 'ready', snapshot });
            }
            catch (error) {
                if (active)
                    setState({ kind: 'error', message: error instanceof Error ? error.message : 'request failed' });
            }
        };
        void load();
        const timer = window.setInterval(() => { void load(); }, POLL_MS);
        return () => { active = false; window.clearInterval(timer); };
    }, [retry]);
    if (state.kind === 'loading')
        return _jsx("section", { className: css.section, children: _jsx("p", { children: "Loading Crew messaging\u2026" }) });
    if (state.kind === 'error')
        return _jsxs("section", { className: css.section, children: [_jsxs("p", { className: css.error, children: ["Crew messaging is unavailable: ", state.message] }), _jsx("button", { type: "button", className: css.secondary, onClick: () => { setRetry(value => value + 1); }, children: "Retry" })] });
    return _jsx(SnapshotView, { snapshot: state.snapshot });
}
function SnapshotView({ snapshot }) {
    return _jsxs("section", { className: css.section, "data-crew-cockpit": true, children: [_jsxs("header", { className: css.header, children: [_jsxs("div", { children: [_jsx("h2", { children: "Crew messaging" }), _jsx("p", { children: "Read-only adapter and fabric status. Changes to runtime tuning require a DSH service restart." })] }), _jsx("span", { className: snapshot.fabric.ready && snapshot.adapter.connected ? css.good : css.warning, children: snapshot.fabric.ready && snapshot.adapter.connected ? 'Connected' : 'Unavailable' })] }), _jsxs("div", { className: css.status, children: [_jsx(Status, { label: "Fabric", value: snapshot.fabric.status }), _jsx(Status, { label: "Adapter", value: snapshot.adapter.stopped ? 'stopped' : snapshot.adapter.initialized ? 'running' : 'starting' }), _jsx(Status, { label: "Lease", value: snapshot.adapter.connected ? snapshot.adapter.leaseExpiresAt === undefined ? 'active' : `active until ${snapshot.adapter.leaseExpiresAt}` : 'absent' })] }), _jsx(Panel, { title: "Directory", empty: "No Crew addresses are currently discoverable.", hasItems: snapshot.directory.length > 0, children: _jsx("div", { className: css.rows, children: snapshot.directory.map(entry => _jsxs("div", { className: css.row, children: [_jsx("strong", { children: entry.address }), _jsx("span", { children: entry.source === 'configured' ? 'configured' : 'session title' }), _jsx("span", { className: entry.status === 'routable' ? css.good : css.warning, children: entry.status })] }, entry.address)) }) }), _jsx(Panel, { title: "Recent messages", empty: "No recent Crew messages.", hasItems: snapshot.messages.length > 0, children: _jsx("div", { className: css.traffic, children: snapshot.messages.map(message => _jsxs("article", { className: css.trafficRow, children: [_jsxs("div", { children: [_jsxs("strong", { children: [message.from, " \u2192 ", message.to] }), _jsx("span", { children: message.createdAt })] }), _jsx("p", { children: message.preview || '(empty message)' }), _jsxs("small", { children: [message.id, message.replyTo === undefined ? '' : ` · reply to ${message.replyTo}`] })] }, message.id)) }) }), _jsx(Panel, { title: "Recent deliveries", empty: "No recent Crew deliveries.", hasItems: snapshot.deliveries.length > 0, children: _jsx("div", { className: css.traffic, children: snapshot.deliveries.map(delivery => _jsxs("article", { className: css.trafficRow, children: [_jsxs("div", { children: [_jsx("strong", { children: delivery.recipient }), _jsx("span", { className: delivery.state === 'delivered' ? css.good : css.warning, children: delivery.state })] }), _jsxs("small", { children: [delivery.messageId, delivery.action === undefined ? '' : ` · ${delivery.action}`, delivery.updatedAt === undefined ? '' : ` · ${delivery.updatedAt}`] })] }, delivery.id)) }) }), _jsx(Panel, { title: "Runtime tuning", empty: "", hasItems: true, children: _jsx("dl", { className: css.tuning, children: Object.entries(snapshot.tuning).map(([key, value]) => _jsxs("div", { children: [_jsx("dt", { children: key }), _jsx("dd", { children: String(value) })] }, key)) }) })] });
}
function Status({ label, value }) { return _jsxs("div", { children: [_jsx("span", { children: label }), _jsx("strong", { children: value })] }); }
function Panel({ title, empty, hasItems, children }) { return _jsxs("section", { className: css.panel, children: [_jsx("h3", { children: title }), hasItems ? children : _jsx("p", { className: css.empty, children: empty })] }); }
function isObject(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function tuningValid(value) { return typeof value.leaseDuration === 'string' && typeof value.renewMs === 'number' && typeof value.pollMs === 'number' && typeof value.claimDuration === 'string' && typeof value.ttl === 'string' && typeof value.acceptanceTimeoutMs === 'number' && typeof value.acceptancePollMs === 'number'; }
function directoryEntry(value) { return isObject(value) && typeof value.address === 'string' && (value.status === 'routable' || value.status === 'ambiguous' || value.status === 'conflict') && (value.source === 'configured' || value.source === 'session-title') ? [{ address: value.address, status: value.status, source: value.source }] : []; }
function messageSummary(value) { return isObject(value) && typeof value.id === 'string' && typeof value.from === 'string' && typeof value.to === 'string' && typeof value.createdAt === 'string' && typeof value.preview === 'string' && (value.replyTo === undefined || typeof value.replyTo === 'string') ? [{ id: value.id, from: value.from, to: value.to, createdAt: value.createdAt, preview: value.preview, ...(value.replyTo === undefined ? {} : { replyTo: value.replyTo }) }] : []; }
function deliverySummary(value) { return isObject(value) && typeof value.id === 'string' && typeof value.messageId === 'string' && typeof value.recipient === 'string' && typeof value.state === 'string' && (value.action === undefined || typeof value.action === 'string') && (value.updatedAt === undefined || typeof value.updatedAt === 'string') ? [{ id: value.id, messageId: value.messageId, recipient: value.recipient, state: value.state, ...(value.action === undefined ? {} : { action: value.action }), ...(value.updatedAt === undefined ? {} : { updatedAt: value.updatedAt }) }] : []; }
//# sourceMappingURL=CrewCockpit.js.map