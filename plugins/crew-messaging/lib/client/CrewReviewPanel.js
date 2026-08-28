import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Browser panel for the private Crew review worker pool. */
import { useEffect, useState } from 'react';
import css from "./CrewCockpit.styles.js";
export const CREW_REVIEW_DASHBOARD_ENDPOINT = '/plugins/dsh-crew-messaging/review-pool';
export const CREW_REVIEW_AFFINITY_ENDPOINT = '/plugins/dsh-crew-messaging/review-affinity';
const POLL_MS = 5_000;
/** Decode only the plugin-owned review projection and discard unknown fields. */
export function decodeCrewReviewDashboard(value) {
    if (!isObject(value) || !isObject(value.health) || typeof value.backend !== 'string'
        || !nonNegativeInteger(value.capacity) || !nonNegativeInteger(value.queued) || !nonNegativeInteger(value.running)
        || typeof value.health.ready !== 'boolean' || typeof value.health.status !== 'string'
        || !Array.isArray(value.recent) || !Array.isArray(value.affinities) || !Array.isArray(value.failures))
        return undefined;
    const recent = value.recent.flatMap(reviewJob);
    const affinities = value.affinities.flatMap(reviewAffinity);
    const failures = value.failures.flatMap(reviewJob);
    if (recent.length !== value.recent.length || affinities.length !== value.affinities.length || failures.length !== value.failures.length)
        return undefined;
    return {
        health: { ready: value.health.ready, status: value.health.status },
        backend: value.backend,
        capacity: value.capacity,
        queued: value.queued,
        running: value.running,
        recent,
        affinities,
        failures,
    };
}
/** Render pool health, bounded review evidence, and the idle-affinity release control. */
export function CrewReviewPanel() {
    const [state, setState] = useState({ kind: 'loading' });
    const [refresh, setRefresh] = useState(0);
    const [releasing, setReleasing] = useState();
    const [actionError, setActionError] = useState();
    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const response = await fetch(CREW_REVIEW_DASHBOARD_ENDPOINT, { cache: 'no-store' });
                if (!response.ok)
                    throw new Error(`request failed (${String(response.status)})`);
                const snapshot = decodeCrewReviewDashboard(await response.json());
                if (snapshot === undefined)
                    throw new Error('received an invalid review pool response');
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
    }, [refresh]);
    const release = async (affinity) => {
        const key = `${affinity.projectId}:${String(affinity.taskId)}`;
        setReleasing(key);
        setActionError(undefined);
        try {
            const url = new URL(CREW_REVIEW_AFFINITY_ENDPOINT, window.location.href);
            url.searchParams.set('project', affinity.projectId);
            url.searchParams.set('task', String(affinity.taskId));
            const response = await fetch(url, { method: 'DELETE', cache: 'no-store' });
            if (!response.ok) {
                const value = await response.json().catch(() => undefined);
                throw new Error(isObject(value) && typeof value.error === 'string' ? value.error : `release failed (${String(response.status)})`);
            }
            setRefresh(value => value + 1);
        }
        catch (error) {
            setActionError(error instanceof Error ? error.message : 'release failed');
        }
        finally {
            setReleasing(undefined);
        }
    };
    if (state.kind === 'loading')
        return _jsxs("section", { className: css.panel, "data-crew-review": true, children: [_jsx("h3", { children: "Crew review pool" }), _jsx("p", { className: css.empty, children: "Loading review service\u2026" })] });
    if (state.kind === 'error')
        return _jsxs("section", { className: css.panel, "data-crew-review": true, children: [_jsxs("div", { className: css.reviewHeader, children: [_jsx("h3", { children: "Crew review pool" }), _jsx("button", { type: "button", className: css.secondary, onClick: () => { setRefresh(value => value + 1); }, children: "Refresh" })] }), _jsxs("p", { className: css.error, children: ["Crew review service is unavailable: ", state.message] })] });
    const snapshot = state.snapshot;
    return _jsxs("section", { className: css.panel, "data-crew-review": true, children: [_jsxs("div", { className: css.reviewHeader, children: [_jsxs("div", { children: [_jsx("h3", { children: "Crew review pool" }), _jsx("p", { className: css.reviewDescription, children: "Private reviewer workers and recent Den review outcomes. Findings stay in Den." })] }), _jsx("button", { type: "button", className: css.secondary, onClick: () => { setRefresh(value => value + 1); }, children: "Refresh" })] }), _jsxs("div", { className: css.reviewStatus, children: [_jsx(Status, { label: "Service", value: snapshot.health.ready ? snapshot.health.status : 'unavailable', good: snapshot.health.ready }), _jsx(Status, { label: "Backend", value: snapshot.backend, good: snapshot.backend !== 'unavailable' }), _jsx(Status, { label: "Running jobs", value: `${String(snapshot.running)} / ${String(snapshot.capacity)}`, good: snapshot.running <= snapshot.capacity }), _jsx(Status, { label: "Queued", value: String(snapshot.queued), good: snapshot.queued === 0 })] }), snapshot.failures.length > 0 ? _jsx(ReviewFailures, { failures: snapshot.failures }) : null, _jsx(ReviewJobs, { jobs: snapshot.recent }), _jsxs("section", { className: css.reviewAffinities, children: [_jsx("h4", { children: "Retained reviewers" }), snapshot.affinities.length === 0 ? _jsx("p", { className: css.empty, children: "No idle task affinities." }) : _jsx("div", { className: css.reviewAffinityRows, children: snapshot.affinities.map(affinity => {
                            const key = `${affinity.projectId}:${String(affinity.taskId)}`;
                            return _jsxs("div", { className: css.reviewAffinityRow, children: [_jsxs("span", { children: [_jsxs("strong", { children: [affinity.projectId, " / task ", String(affinity.taskId)] }), _jsxs("small", { children: ["expires ", affinity.expiresAt] })] }), _jsx("button", { type: "button", className: css.secondary, disabled: releasing !== undefined, onClick: () => { void release(affinity); }, children: releasing === key ? 'Releasing…' : 'Release' })] }, key);
                        }) }), actionError === undefined ? null : _jsx("p", { className: css.error, children: actionError })] })] });
}
function ReviewJobs({ jobs }) {
    return _jsxs("section", { className: css.reviewJobs, children: [_jsx("h4", { children: "Recent verdicts" }), jobs.length === 0 ? _jsx("p", { className: css.empty, children: "No completed review jobs." }) : _jsx("div", { className: css.reviewJobRows, children: jobs.map(job => _jsxs("article", { className: css.reviewJobRow, children: [_jsxs("div", { children: [_jsxs("strong", { children: [job.projectId, " / task ", String(job.taskId)] }), _jsx("span", { className: job.verdict === 'looks_good' ? css.good : job.verdict === 'changes_requested' ? css.warning : '', children: job.verdict ?? job.state })] }), _jsxs("small", { children: ["round ", String(job.reviewRoundId), " \u00B7 ", job.updatedAt] }), job.failure === undefined ? null : _jsx("p", { className: css.error, children: job.failure })] }, job.id)) })] });
}
function ReviewFailures({ failures }) {
    return _jsxs("section", { className: css.reviewFailures, children: [_jsx("h4", { children: "Action needed" }), _jsx("div", { className: css.reviewJobRows, children: failures.map(job => _jsxs("article", { className: css.reviewJobRow, children: [_jsxs("div", { children: [_jsxs("strong", { children: [job.projectId, " / task ", String(job.taskId)] }), _jsx("span", { className: css.error, children: job.state })] }), _jsx("p", { className: css.error, children: job.failure ?? 'Review job failed' }), _jsxs("small", { children: ["round ", String(job.reviewRoundId), " \u00B7 ", job.updatedAt] })] }, `failure-${job.id}`)) })] });
}
function Status({ label, value, good }) { return _jsxs("div", { children: [_jsx("span", { children: label }), _jsx("strong", { className: good ? css.good : css.warning, children: value })] }); }
function isObject(value) { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function nonNegativeInteger(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function positiveInteger(value) { return typeof value === 'number' && Number.isSafeInteger(value) && value > 0; }
function reviewJob(value) {
    if (!isObject(value) || typeof value.id !== 'string' || typeof value.projectId !== 'string' || !positiveInteger(value.taskId) || !positiveInteger(value.reviewRoundId) || typeof value.state !== 'string' || typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string')
        return [];
    const verdict = typeof value.verdict === 'string' ? value.verdict : undefined;
    const failure = typeof value.failure === 'string' && value.failure !== '' ? value.failure : undefined;
    return [{ id: value.id, projectId: value.projectId, taskId: value.taskId, reviewRoundId: value.reviewRoundId, state: value.state, ...(verdict === undefined ? {} : { verdict }), ...(failure === undefined ? {} : { failure }), createdAt: value.createdAt, updatedAt: value.updatedAt }];
}
function reviewAffinity(value) { return isObject(value) && typeof value.projectId === 'string' && positiveInteger(value.taskId) && typeof value.expiresAt === 'string' ? [{ projectId: value.projectId, taskId: value.taskId, expiresAt: value.expiresAt }] : []; }
//# sourceMappingURL=CrewReviewPanel.js.map