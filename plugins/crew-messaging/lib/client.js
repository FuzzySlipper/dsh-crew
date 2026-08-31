window.__ModuleLoader__.load({
	id: "dsh-crew-messaging",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region lib/client/CrewCockpit.styles.js
		/** Plugin-owned style injection; the client bundle has no CSS pipeline of its own. */
		const css = {
			section: "dsh-crew-cockpit",
			header: "dsh-crew-header",
			good: "dsh-crew-good",
			warning: "dsh-crew-warning",
			status: "dsh-crew-status",
			panel: "dsh-crew-panel",
			rows: "dsh-crew-rows",
			row: "dsh-crew-row",
			traffic: "dsh-crew-traffic",
			trafficRow: "dsh-crew-traffic-row",
			tuning: "dsh-crew-tuning",
			empty: "dsh-crew-empty",
			error: "dsh-crew-error",
			secondary: "dsh-crew-secondary",
			reviewHeader: "dsh-crew-review-header",
			reviewDescription: "dsh-crew-review-description",
			reviewStatus: "dsh-crew-review-status",
			reviewJobs: "dsh-crew-review-jobs",
			reviewJobRows: "dsh-crew-review-job-rows",
			reviewJobRow: "dsh-crew-review-job-row",
			reviewFailures: "dsh-crew-review-failures",
			reviewAffinities: "dsh-crew-review-affinities",
			reviewAffinityRows: "dsh-crew-review-affinity-rows",
			reviewAffinityRow: "dsh-crew-review-affinity-row"
		};
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"dsh-crew-messaging/cockpit\"]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-crew-messaging";
			tag.dataset.pluginCss = "dsh-crew-messaging/cockpit";
			tag.textContent = `
 .dsh-crew-cockpit{display:grid;gap:20px;color:var(--dsw-alias-label-primary)}.dsh-crew-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.dsh-crew-header h2,.dsh-crew-panel h3{margin:0}.dsh-crew-header p,.dsh-crew-empty{margin:6px 0 0;color:var(--dsw-alias-label-secondary)}.dsh-crew-status,.dsh-crew-rows{display:grid;gap:8px}.dsh-crew-status{grid-template-columns:repeat(3,minmax(0,1fr))}.dsh-crew-status>div,.dsh-crew-row,.dsh-crew-traffic-row,.dsh-crew-panel{border:1px solid var(--dsw-alias-border-l1);border-radius:12px}.dsh-crew-status>div{display:grid;gap:4px;padding:12px}.dsh-crew-status span,.dsh-crew-row span,.dsh-crew-traffic-row span,.dsh-crew-traffic-row small,.dsh-crew-tuning dt{color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-crew-panel{padding:14px}.dsh-crew-rows{margin-top:10px}.dsh-crew-row{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;padding:10px}.dsh-crew-traffic{display:grid;gap:8px;margin-top:10px}.dsh-crew-traffic-row{display:grid;gap:6px;padding:10px}.dsh-crew-traffic-row>div{display:flex;justify-content:space-between;gap:12px}.dsh-crew-traffic-row p{margin:0;white-space:pre-wrap}.dsh-crew-tuning{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;margin:10px 0 0}.dsh-crew-tuning div{display:flex;justify-content:space-between;gap:8px}.dsh-crew-tuning dt,.dsh-crew-tuning dd{margin:0}.dsh-crew-good{color:var(--dsw-alias-state-success-primary)}.dsh-crew-warning{color:var(--dsw-alias-state-warn-label)}.dsh-crew-error{color:var(--dsw-alias-state-error-primary)}.dsh-crew-secondary{width:fit-content;padding:6px 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:inherit;cursor:pointer}@media(max-width:640px){.dsh-crew-status,.dsh-crew-tuning{grid-template-columns:1fr}}
 .dsh-crew-review-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.dsh-crew-review-header h3,.dsh-crew-review-jobs h4,.dsh-crew-review-failures h4,.dsh-crew-review-affinities h4{margin:0}.dsh-crew-review-description{margin:6px 0 0;color:var(--dsw-alias-label-secondary)}.dsh-crew-review-status{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:14px}.dsh-crew-review-status>div{display:grid;gap:4px;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px}.dsh-crew-review-status span,.dsh-crew-review-job-row small,.dsh-crew-review-affinity-row small{color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-crew-review-jobs,.dsh-crew-review-failures,.dsh-crew-review-affinities{display:grid;gap:8px;margin-top:16px}.dsh-crew-review-job-rows,.dsh-crew-review-affinity-rows{display:grid;gap:8px}.dsh-crew-review-job-row,.dsh-crew-review-affinity-row{display:grid;gap:5px;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:10px}.dsh-crew-review-job-row>div{display:flex;justify-content:space-between;gap:12px}.dsh-crew-review-job-row p{margin:0;white-space:pre-wrap}.dsh-crew-review-affinity-row{grid-template-columns:1fr auto;align-items:center}.dsh-crew-review-affinity-row span{display:grid;gap:4px}@media(max-width:640px){.dsh-crew-review-status{grid-template-columns:repeat(2,minmax(0,1fr))}}
`;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region lib/client/CrewCockpit.js
		/** Read-only global Crew settings cockpit. */
		const CREW_DASHBOARD_ENDPOINT = "/plugins/dsh-crew-messaging/dashboard";
		const POLL_MS$1 = 5e3;
		/** Decode the narrow response the Host projection owns. */
		function decodeCrewDashboard(value) {
			if (!isObject$1(value) || !isObject$1(value.fabric) || !isObject$1(value.adapter) || !isObject$1(value.tuning) || !Array.isArray(value.directory) || !Array.isArray(value.messages) || !Array.isArray(value.deliveries)) return void 0;
			const fabric = value.fabric;
			const adapter = value.adapter;
			const tuning = value.tuning;
			if (typeof fabric.ready !== "boolean" || typeof fabric.status !== "string" || typeof adapter.initialized !== "boolean" || typeof adapter.stopped !== "boolean" || typeof adapter.connected !== "boolean" || adapter.leaseExpiresAt !== void 0 && typeof adapter.leaseExpiresAt !== "string" || !tuningValid(tuning)) return void 0;
			const directory = value.directory.flatMap(directoryEntry);
			const messages = value.messages.flatMap(messageSummary);
			const deliveries = value.deliveries.flatMap(deliverySummary);
			if (directory.length !== value.directory.length || messages.length !== value.messages.length || deliveries.length !== value.deliveries.length) return void 0;
			return {
				fabric: {
					ready: fabric.ready,
					status: fabric.status
				},
				adapter: {
					initialized: adapter.initialized,
					stopped: adapter.stopped,
					connected: adapter.connected,
					...adapter.leaseExpiresAt === void 0 ? {} : { leaseExpiresAt: adapter.leaseExpiresAt }
				},
				directory,
				tuning: {
					leaseDuration: tuning.leaseDuration,
					renewMs: tuning.renewMs,
					pollMs: tuning.pollMs,
					claimDuration: tuning.claimDuration,
					ttl: tuning.ttl,
					acceptanceTimeoutMs: tuning.acceptanceTimeoutMs,
					acceptancePollMs: tuning.acceptancePollMs
				},
				messages,
				deliveries
			};
		}
		/** Render the v1 Crew global settings page. */
		function CrewCockpit() {
			const [state, setState] = (0, react.useState)({ kind: "loading" });
			const [retry, setRetry] = (0, react.useState)(0);
			(0, react.useEffect)(() => {
				let active = true;
				const load = async () => {
					try {
						const response = await fetch(CREW_DASHBOARD_ENDPOINT, { cache: "no-store" });
						if (!response.ok) throw new Error(`request failed (${String(response.status)})`);
						const snapshot = decodeCrewDashboard(await response.json());
						if (snapshot === void 0) throw new Error("received an invalid dashboard response");
						if (active) setState({
							kind: "ready",
							snapshot
						});
					} catch (error) {
						if (active) setState({
							kind: "error",
							message: error instanceof Error ? error.message : "request failed"
						});
					}
				};
				load();
				const timer = window.setInterval(() => {
					load();
				}, POLL_MS$1);
				return () => {
					active = false;
					window.clearInterval(timer);
				};
			}, [retry]);
			if (state.kind === "loading") return (0, react_jsx_runtime.jsx)("section", {
				className: css.section,
				children: (0, react_jsx_runtime.jsx)("p", { children: "Loading Crew messaging…" })
			});
			if (state.kind === "error") return (0, react_jsx_runtime.jsxs)("section", {
				className: css.section,
				children: [(0, react_jsx_runtime.jsxs)("p", {
					className: css.error,
					children: ["Crew messaging is unavailable: ", state.message]
				}), (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: css.secondary,
					onClick: () => {
						setRetry((value) => value + 1);
					},
					children: "Retry"
				})]
			});
			return (0, react_jsx_runtime.jsx)(SnapshotView, { snapshot: state.snapshot });
		}
		function SnapshotView({ snapshot }) {
			return (0, react_jsx_runtime.jsxs)("section", {
				className: css.section,
				"data-crew-cockpit": true,
				children: [
					(0, react_jsx_runtime.jsxs)("header", {
						className: css.header,
						children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("h2", { children: "Crew messaging" }), (0, react_jsx_runtime.jsx)("p", { children: "Read-only adapter and fabric status. Changes to runtime tuning require a DSH service restart." })] }), (0, react_jsx_runtime.jsx)("span", {
							className: snapshot.fabric.ready && snapshot.adapter.connected ? css.good : css.warning,
							children: snapshot.fabric.ready && snapshot.adapter.connected ? "Connected" : "Unavailable"
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: css.status,
						children: [
							(0, react_jsx_runtime.jsx)(Status$1, {
								label: "Fabric",
								value: snapshot.fabric.status
							}),
							(0, react_jsx_runtime.jsx)(Status$1, {
								label: "Adapter",
								value: snapshot.adapter.stopped ? "stopped" : snapshot.adapter.initialized ? "running" : "starting"
							}),
							(0, react_jsx_runtime.jsx)(Status$1, {
								label: "Lease",
								value: snapshot.adapter.connected ? snapshot.adapter.leaseExpiresAt === void 0 ? "active" : `active until ${snapshot.adapter.leaseExpiresAt}` : "absent"
							})
						]
					}),
					(0, react_jsx_runtime.jsx)(Panel, {
						title: "Directory",
						empty: "No Crew addresses are currently discoverable.",
						hasItems: snapshot.directory.length > 0,
						children: (0, react_jsx_runtime.jsx)("div", {
							className: css.rows,
							children: snapshot.directory.map((entry) => (0, react_jsx_runtime.jsxs)("div", {
								className: css.row,
								children: [
									(0, react_jsx_runtime.jsx)("strong", { children: entry.address }),
									(0, react_jsx_runtime.jsx)("span", { children: entry.source === "configured" ? "configured" : "session title" }),
									(0, react_jsx_runtime.jsx)("span", {
										className: entry.status === "routable" ? css.good : css.warning,
										children: entry.status
									})
								]
							}, entry.address))
						})
					}),
					(0, react_jsx_runtime.jsx)(Panel, {
						title: "Recent messages",
						empty: "No recent Crew messages.",
						hasItems: snapshot.messages.length > 0,
						children: (0, react_jsx_runtime.jsx)("div", {
							className: css.traffic,
							children: snapshot.messages.map((message) => (0, react_jsx_runtime.jsxs)("article", {
								className: css.trafficRow,
								children: [
									(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsxs)("strong", { children: [
										message.from,
										" → ",
										message.to
									] }), (0, react_jsx_runtime.jsx)("span", { children: message.createdAt })] }),
									(0, react_jsx_runtime.jsx)("p", { children: message.preview || "(empty message)" }),
									(0, react_jsx_runtime.jsxs)("small", { children: [message.id, message.replyTo === void 0 ? "" : ` · reply to ${message.replyTo}`] })
								]
							}, message.id))
						})
					}),
					(0, react_jsx_runtime.jsx)(Panel, {
						title: "Recent deliveries",
						empty: "No recent Crew deliveries.",
						hasItems: snapshot.deliveries.length > 0,
						children: (0, react_jsx_runtime.jsx)("div", {
							className: css.traffic,
							children: snapshot.deliveries.map((delivery) => (0, react_jsx_runtime.jsxs)("article", {
								className: css.trafficRow,
								children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("strong", { children: delivery.recipient }), (0, react_jsx_runtime.jsx)("span", {
									className: delivery.state === "delivered" ? css.good : css.warning,
									children: delivery.state
								})] }), (0, react_jsx_runtime.jsxs)("small", { children: [
									delivery.messageId,
									delivery.action === void 0 ? "" : ` · ${delivery.action}`,
									delivery.updatedAt === void 0 ? "" : ` · ${delivery.updatedAt}`
								] })]
							}, delivery.id))
						})
					}),
					(0, react_jsx_runtime.jsx)(Panel, {
						title: "Runtime tuning",
						empty: "",
						hasItems: true,
						children: (0, react_jsx_runtime.jsx)("dl", {
							className: css.tuning,
							children: Object.entries(snapshot.tuning).map(([key, value]) => (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("dt", { children: key }), (0, react_jsx_runtime.jsx)("dd", { children: String(value) })] }, key))
						})
					})
				]
			});
		}
		function Status$1({ label, value }) {
			return (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("span", { children: label }), (0, react_jsx_runtime.jsx)("strong", { children: value })] });
		}
		function Panel({ title, empty, hasItems, children }) {
			return (0, react_jsx_runtime.jsxs)("section", {
				className: css.panel,
				children: [(0, react_jsx_runtime.jsx)("h3", { children: title }), hasItems ? children : (0, react_jsx_runtime.jsx)("p", {
					className: css.empty,
					children: empty
				})]
			});
		}
		function isObject$1(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function tuningValid(value) {
			return typeof value.leaseDuration === "string" && typeof value.renewMs === "number" && typeof value.pollMs === "number" && typeof value.claimDuration === "string" && typeof value.ttl === "string" && typeof value.acceptanceTimeoutMs === "number" && typeof value.acceptancePollMs === "number";
		}
		function directoryEntry(value) {
			return isObject$1(value) && typeof value.address === "string" && (value.status === "routable" || value.status === "ambiguous" || value.status === "conflict") && (value.source === "configured" || value.source === "session-title") ? [{
				address: value.address,
				status: value.status,
				source: value.source
			}] : [];
		}
		function messageSummary(value) {
			return isObject$1(value) && typeof value.id === "string" && typeof value.from === "string" && typeof value.to === "string" && typeof value.createdAt === "string" && typeof value.preview === "string" && (value.replyTo === void 0 || typeof value.replyTo === "string") ? [{
				id: value.id,
				from: value.from,
				to: value.to,
				createdAt: value.createdAt,
				preview: value.preview,
				...value.replyTo === void 0 ? {} : { replyTo: value.replyTo }
			}] : [];
		}
		function deliverySummary(value) {
			return isObject$1(value) && typeof value.id === "string" && typeof value.messageId === "string" && typeof value.recipient === "string" && typeof value.state === "string" && (value.action === void 0 || typeof value.action === "string") && (value.updatedAt === void 0 || typeof value.updatedAt === "string") ? [{
				id: value.id,
				messageId: value.messageId,
				recipient: value.recipient,
				state: value.state,
				...value.action === void 0 ? {} : { action: value.action },
				...value.updatedAt === void 0 ? {} : { updatedAt: value.updatedAt }
			}] : [];
		}
		//#endregion
		//#region lib/client/CrewReviewPanel.js
		/** Browser panel for the private Crew review worker pool. */
		const CREW_REVIEW_DASHBOARD_ENDPOINT = "/plugins/dsh-crew-messaging/review-pool";
		const CREW_REVIEW_AFFINITY_ENDPOINT = "/plugins/dsh-crew-messaging/review-affinity";
		const CREW_REVIEW_RETRY_ENDPOINT = "/plugins/dsh-crew-messaging/review-retry";
		const POLL_MS = 5e3;
		/** Decode only the plugin-owned review projection and discard unknown fields. */
		function decodeCrewReviewDashboard(value) {
			if (!isObject(value) || !isObject(value.health) || typeof value.backend !== "string" || !nonNegativeInteger(value.capacity) || !nonNegativeInteger(value.queued) || !nonNegativeInteger(value.running) || !nonNegativeInteger(value.finalizing) || typeof value.health.ready !== "boolean" || typeof value.health.status !== "string" || !Array.isArray(value.active) || !Array.isArray(value.recent) || !Array.isArray(value.affinities) || !Array.isArray(value.failures)) return void 0;
			const active = value.active.flatMap(reviewJob);
			const recent = value.recent.flatMap(reviewJob);
			const affinities = value.affinities.flatMap(reviewAffinity);
			const failures = value.failures.flatMap(reviewJob);
			if (active.length !== value.active.length || recent.length !== value.recent.length || affinities.length !== value.affinities.length || failures.length !== value.failures.length) return void 0;
			return {
				health: {
					ready: value.health.ready,
					status: value.health.status
				},
				backend: value.backend,
				capacity: value.capacity,
				queued: value.queued,
				running: value.running,
				finalizing: value.finalizing,
				active,
				recent,
				affinities,
				failures
			};
		}
		/** Render pool health, bounded review evidence, and the idle-affinity release control. */
		function CrewReviewPanel() {
			const [state, setState] = (0, react.useState)({ kind: "loading" });
			const [refresh, setRefresh] = (0, react.useState)(0);
			const [releasing, setReleasing] = (0, react.useState)();
			const [retrying, setRetrying] = (0, react.useState)();
			const retryingRef = (0, react.useRef)();
			const [releaseError, setReleaseError] = (0, react.useState)();
			const [retryError, setRetryError] = (0, react.useState)();
			(0, react.useEffect)(() => {
				let active = true;
				const load = async () => {
					try {
						const response = await fetch(CREW_REVIEW_DASHBOARD_ENDPOINT, { cache: "no-store" });
						if (!response.ok) throw new Error(`request failed (${String(response.status)})`);
						const snapshot = decodeCrewReviewDashboard(await response.json());
						if (snapshot === void 0) throw new Error("received an invalid review pool response");
						if (active) setState({
							kind: "ready",
							snapshot,
							refreshedAt: (/* @__PURE__ */ new Date()).toLocaleTimeString()
						});
					} catch (error) {
						if (active) setState({
							kind: "error",
							message: error instanceof Error ? error.message : "request failed"
						});
					}
				};
				load();
				const timer = window.setInterval(() => {
					load();
				}, POLL_MS);
				return () => {
					active = false;
					window.clearInterval(timer);
				};
			}, [refresh]);
			const release = async (affinity) => {
				setReleasing(`${affinity.projectId}:${String(affinity.taskId)}`);
				setReleaseError(void 0);
				try {
					const url = new URL(CREW_REVIEW_AFFINITY_ENDPOINT, window.location.href);
					url.searchParams.set("project", affinity.projectId);
					url.searchParams.set("task", String(affinity.taskId));
					const response = await fetch(url, {
						method: "DELETE",
						cache: "no-store"
					});
					if (!response.ok) {
						const value = await response.json().catch(() => void 0);
						throw new Error(isObject(value) && typeof value.error === "string" ? value.error : `release failed (${String(response.status)})`);
					}
					setRefresh((value) => value + 1);
				} catch (error) {
					setReleaseError(error instanceof Error ? error.message : "release failed");
				} finally {
					setReleasing(void 0);
				}
			};
			const retry = async (job) => {
				if (retryingRef.current !== void 0) return;
				retryingRef.current = job.id;
				setRetrying(job.id);
				setRetryError(void 0);
				try {
					const url = new URL(CREW_REVIEW_RETRY_ENDPOINT, window.location.href);
					url.searchParams.set("job_id", job.id);
					const response = await fetch(url, {
						method: "POST",
						headers: { accept: "application/json" },
						cache: "no-store"
					});
					if (!response.ok) {
						const value = await response.json().catch(() => void 0);
						throw new Error(isObject(value) && typeof value.error === "string" ? value.error : `retry failed (${String(response.status)})`);
					}
					const value = await response.json().catch(() => void 0);
					if (!isObject(value) || value.retried !== true || !isObject(value.job) || value.job.id !== job.id) throw new Error("received an invalid review retry response");
					setRefresh((value) => value + 1);
				} catch (error) {
					setRetryError(error instanceof Error ? error.message : "retry failed");
				} finally {
					retryingRef.current = void 0;
					setRetrying(void 0);
				}
			};
			if (state.kind === "loading") return (0, react_jsx_runtime.jsxs)("section", {
				className: css.panel,
				"data-crew-review": true,
				children: [(0, react_jsx_runtime.jsx)("h3", { children: "Crew review pool" }), (0, react_jsx_runtime.jsx)("p", {
					className: css.empty,
					children: "Loading review service…"
				})]
			});
			if (state.kind === "error") return (0, react_jsx_runtime.jsxs)("section", {
				className: css.panel,
				"data-crew-review": true,
				children: [(0, react_jsx_runtime.jsxs)("div", {
					className: css.reviewHeader,
					children: [(0, react_jsx_runtime.jsx)("h3", { children: "Crew review pool" }), (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: css.secondary,
						onClick: () => {
							setRefresh((value) => value + 1);
						},
						children: "Refresh"
					})]
				}), (0, react_jsx_runtime.jsxs)("p", {
					className: css.error,
					children: ["Crew review service is unavailable: ", state.message]
				})]
			});
			const snapshot = state.snapshot;
			return (0, react_jsx_runtime.jsxs)("section", {
				className: css.panel,
				"data-crew-review": true,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: css.reviewHeader,
						children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("h3", { children: "Crew review pool" }), (0, react_jsx_runtime.jsxs)("p", {
							className: css.reviewDescription,
							children: [
								"Private reviewer workers and recent Den review outcomes. Findings stay in Den. Last refreshed ",
								state.refreshedAt,
								"."
							]
						})] }), (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: css.secondary,
							onClick: () => {
								setRefresh((value) => value + 1);
							},
							children: "Refresh status"
						})]
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: css.reviewStatus,
						children: [
							(0, react_jsx_runtime.jsx)(Status, {
								label: "Service",
								value: snapshot.health.ready ? snapshot.health.status : "unavailable",
								good: snapshot.health.ready
							}),
							(0, react_jsx_runtime.jsx)(Status, {
								label: "Backend",
								value: snapshot.backend,
								good: snapshot.backend !== "unavailable"
							}),
							(0, react_jsx_runtime.jsx)(Status, {
								label: "Running jobs",
								value: `${String(snapshot.running)} / ${String(snapshot.capacity)}`,
								good: snapshot.running <= snapshot.capacity
							}),
							(0, react_jsx_runtime.jsx)(Status, {
								label: "Finalizing",
								value: String(snapshot.finalizing),
								good: snapshot.finalizing === 0
							}),
							(0, react_jsx_runtime.jsx)(Status, {
								label: "Queued",
								value: String(snapshot.queued),
								good: snapshot.queued === 0
							})
						]
					}),
					snapshot.failures.length > 0 ? (0, react_jsx_runtime.jsx)(ReviewFailures, {
						failures: snapshot.failures,
						retrying,
						error: retryError,
						onRetry: retry
					}) : (0, react_jsx_runtime.jsx)("p", {
						className: css.empty,
						children: "No unresolved review failures."
					}),
					(0, react_jsx_runtime.jsx)(ReviewJobs, {
						title: "Active jobs",
						empty: "No active review jobs.",
						jobs: snapshot.active
					}),
					(0, react_jsx_runtime.jsx)(ReviewJobs, { jobs: snapshot.recent }),
					(0, react_jsx_runtime.jsxs)("section", {
						className: css.reviewAffinities,
						children: [
							(0, react_jsx_runtime.jsx)("h4", { children: "Retained reviewers" }),
							snapshot.affinities.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
								className: css.empty,
								children: "No idle task affinities."
							}) : (0, react_jsx_runtime.jsx)("div", {
								className: css.reviewAffinityRows,
								children: snapshot.affinities.map((affinity) => {
									const key = `${affinity.projectId}:${String(affinity.taskId)}`;
									return (0, react_jsx_runtime.jsxs)("div", {
										className: css.reviewAffinityRow,
										children: [(0, react_jsx_runtime.jsxs)("span", { children: [(0, react_jsx_runtime.jsxs)("strong", { children: [
											affinity.projectId,
											" / task ",
											String(affinity.taskId)
										] }), (0, react_jsx_runtime.jsxs)("small", { children: ["expires ", affinity.expiresAt] })] }), (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: css.secondary,
											disabled: releasing !== void 0,
											onClick: () => {
												release(affinity);
											},
											children: releasing === key ? "Releasing…" : "Release"
										})]
									}, key);
								})
							}),
							releaseError === void 0 ? null : (0, react_jsx_runtime.jsx)("p", {
								className: css.error,
								children: releaseError
							})
						]
					})
				]
			});
		}
		function ReviewJobs({ jobs, title = "Recent verdicts", empty = "No completed review jobs." }) {
			return (0, react_jsx_runtime.jsxs)("section", {
				className: css.reviewJobs,
				children: [(0, react_jsx_runtime.jsx)("h4", { children: title }), jobs.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
					className: css.empty,
					children: empty
				}) : (0, react_jsx_runtime.jsx)("div", {
					className: css.reviewJobRows,
					children: jobs.map((job) => (0, react_jsx_runtime.jsxs)("article", {
						className: css.reviewJobRow,
						children: [
							(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsxs)("strong", { children: [
								job.projectId,
								" / task ",
								String(job.taskId)
							] }), (0, react_jsx_runtime.jsx)("span", {
								className: job.verdict === "looks_good" ? css.good : job.verdict === "changes_requested" ? css.warning : "",
								children: job.verdict ?? job.state
							})] }),
							(0, react_jsx_runtime.jsxs)("small", { children: [
								"round ",
								String(job.reviewRoundId),
								" · ",
								job.updatedAt
							] }),
							job.failure === void 0 ? null : (0, react_jsx_runtime.jsx)("p", {
								className: css.error,
								children: job.failure
							})
						]
					}, job.id))
				})]
			});
		}
		function ReviewFailures({ failures, retrying, error, onRetry }) {
			return (0, react_jsx_runtime.jsxs)("section", {
				className: css.reviewFailures,
				children: [
					(0, react_jsx_runtime.jsx)("h4", { children: "Action needed" }),
					(0, react_jsx_runtime.jsx)("div", {
						className: css.reviewJobRows,
						children: failures.map((job) => (0, react_jsx_runtime.jsxs)("article", {
							className: css.reviewJobRow,
							children: [
								(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsxs)("strong", { children: [
									job.projectId,
									" / task ",
									String(job.taskId)
								] }), (0, react_jsx_runtime.jsx)("span", {
									className: css.error,
									children: job.state
								})] }),
								(0, react_jsx_runtime.jsx)("p", {
									className: css.error,
									children: job.failure ?? "Review job failed"
								}),
								(0, react_jsx_runtime.jsxs)("small", { children: [
									"round ",
									String(job.reviewRoundId),
									" · ",
									job.updatedAt
								] }),
								(0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: css.secondary,
									disabled: retrying !== void 0,
									onClick: () => {
										onRetry(job);
									},
									children: retrying === job.id ? "Retrying…" : "Retry"
								})
							]
						}, `failure-${job.id}`))
					}),
					error === void 0 ? null : (0, react_jsx_runtime.jsx)("p", {
						className: css.error,
						children: error
					})
				]
			});
		}
		function Status({ label, value, good }) {
			return (0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("span", { children: label }), (0, react_jsx_runtime.jsx)("strong", {
				className: good ? css.good : css.warning,
				children: value
			})] });
		}
		function isObject(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function nonNegativeInteger(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
		}
		function positiveInteger(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
		}
		function reviewJob(value) {
			if (!isObject(value) || typeof value.id !== "string" || typeof value.projectId !== "string" || !positiveInteger(value.taskId) || !positiveInteger(value.reviewRoundId) || typeof value.state !== "string" || typeof value.createdAt !== "string" || typeof value.updatedAt !== "string") return [];
			const verdict = typeof value.verdict === "string" ? value.verdict : void 0;
			const failure = typeof value.failure === "string" && value.failure !== "" ? value.failure : void 0;
			return [{
				id: value.id,
				projectId: value.projectId,
				taskId: value.taskId,
				reviewRoundId: value.reviewRoundId,
				state: value.state,
				...verdict === void 0 ? {} : { verdict },
				...failure === void 0 ? {} : { failure },
				createdAt: value.createdAt,
				updatedAt: value.updatedAt
			}];
		}
		function reviewAffinity(value) {
			return isObject(value) && typeof value.projectId === "string" && positiveInteger(value.taskId) && typeof value.expiresAt === "string" ? [{
				projectId: value.projectId,
				taskId: value.taskId,
				expiresAt: value.expiresAt
			}] : [];
		}
		//#endregion
		//#region lib/client/CrewSessionWorkbench.js
		/** Framework-independent foreign-session workbench state and same-origin browser port. */
		const CREW_SESSIONS_ENDPOINT = "/plugins/dsh-crew-messaging/sessions";
		const CREW_SESSION_EVENTS_ENDPOINT = "/plugins/dsh-crew-messaging/session-events";
		const CREW_SESSION_EVENTS_STREAM_ENDPOINT = "/plugins/dsh-crew-messaging/session-events/stream";
		const CREW_SESSION_PROMPT_ENDPOINT = "/plugins/dsh-crew-messaging/session-prompt";
		const CREW_WORKBENCH_INBOX_ENDPOINT = "/plugins/dsh-crew-messaging/workbench-inbox";
		const CREW_CODEX_CREATE_ENDPOINT = "/plugins/dsh-crew-messaging/codex/create";
		const CREW_CODEX_INTERRUPT_ENDPOINT = "/plugins/dsh-crew-messaging/codex/interrupt";
		const CREW_CODEX_INTERACTIONS_ENDPOINT = "/plugins/dsh-crew-messaging/codex/interactions";
		const CREW_CODEX_RESPOND_ENDPOINT = "/plugins/dsh-crew-messaging/codex/respond";
		const CREW_CODEX_CAPABILITIES_ENDPOINT = "/plugins/dsh-crew-messaging/codex/capabilities";
		const CREW_SESSION_PROMPT_MAX_CHARS = 12e3;
		const INITIAL = {
			open: false,
			loading: false,
			sessions: [],
			selectedSessionId: void 0,
			events: [],
			cursor: 0,
			connection: "closed",
			error: void 0,
			submitting: false,
			submissionError: void 0,
			interactions: [],
			controlCapabilities: [],
			inbox: [],
			inboxLoading: false,
			inboxError: void 0
		};
		/**
		* Own selection fetches and one EventSource. Changing selection or disposing cancels both.
		*/
		var CrewSessionWorkbenchController = class {
			port;
			report;
			operationId;
			state = INITIAL;
			listeners = /* @__PURE__ */ new Set();
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
			constructor(port, report = () => {}, operationId = () => crypto.randomUUID()) {
				this.port = port;
				this.report = report;
				this.operationId = operationId;
			}
			/** @returns The immutable render snapshot. */
			getSnapshot() {
				return this.state;
			}
			/** @param listener Callback after a state transition. @returns Subscription disposer. */
			subscribe(listener) {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			}
			/** Open the drawer and refresh the known public sessions. */
			async open() {
				if (this.disposed) return;
				this.patch({ open: true });
				await this.refresh();
				this.scheduleInbox();
			}
			/** Close the drawer and release all selection-specific browser resources. */
			close() {
				this.listAbort?.abort();
				this.listAbort = void 0;
				this.inboxGeneration += 1;
				this.inboxAbort?.abort();
				this.inboxAbort = void 0;
				if (this.inboxTimer !== void 0) clearTimeout(this.inboxTimer);
				this.inboxTimer = void 0;
				this.selectionGeneration += 1;
				this.stopSelection();
				this.patch({
					open: false,
					loading: false,
					selectedSessionId: void 0,
					events: [],
					cursor: 0,
					connection: "closed",
					error: void 0,
					submitting: false,
					submissionError: void 0,
					interactions: [],
					controlCapabilities: [],
					inbox: [],
					inboxLoading: false,
					inboxError: void 0
				});
			}
			/** Dispose the controller when the DSH client plugin fiber unloads. */
			dispose() {
				if (this.disposed) return;
				this.disposed = true;
				this.close();
				this.listeners.clear();
			}
			/** Reload the public session list and retain only a still-present selection. */
			async refresh() {
				if (this.disposed || !this.state.open) return;
				const inbox = this.reloadInbox();
				this.listAbort?.abort();
				const controller = new AbortController();
				this.listAbort = controller;
				this.patch({
					loading: true,
					error: void 0
				});
				try {
					const snapshot = await this.port.listSessions(controller.signal);
					if (this.disposed || !this.state.open || controller.signal.aborted || this.listAbort !== controller) return;
					const current = this.state.selectedSessionId;
					const selected = current !== void 0 && snapshot.sessions.some((session) => session.sessionId === current) ? current : snapshot.sessions[0]?.sessionId;
					let controlCapabilities = [];
					try {
						controlCapabilities = await this.port.controlCapabilities?.() ?? [];
					} catch {}
					if (controller.signal.aborted || this.listAbort !== controller) return;
					this.patch({
						sessions: snapshot.sessions,
						loading: false,
						controlCapabilities
					});
					if (selected === void 0) {
						this.selectionGeneration += 1;
						this.stopSelection();
						this.patch({
							selectedSessionId: void 0,
							events: [],
							cursor: 0,
							connection: "closed"
						});
						await inbox;
						return;
					}
					if (selected !== current || this.state.events.length === 0) await this.select(selected);
					await inbox;
				} catch (error) {
					if (controller.signal.aborted) return;
					await inbox;
					this.report(error);
					this.patch({
						loading: false,
						error: message(error),
						connection: this.state.selectedSessionId === void 0 ? "error" : this.state.connection
					});
				}
			}
			/** Select one known session, load its bounded history, then follow its stream. */
			async select(sessionId) {
				if (this.disposed || !this.state.open || !this.state.sessions.some((session) => session.sessionId === sessionId)) return;
				const generation = ++this.selectionGeneration;
				this.stopSelection();
				const controller = new AbortController();
				this.eventsAbort = controller;
				this.patch({
					selectedSessionId: sessionId,
					events: [],
					cursor: 0,
					connection: "connecting",
					error: void 0
				});
				try {
					const history = await this.port.listEvents(sessionId, 0, controller.signal);
					if (controller.signal.aborted || generation !== this.selectionGeneration) return;
					const merged = mergeEvents([], history.events);
					const cursor = latestCursor(merged);
					this.patch({
						events: merged,
						cursor
					});
					await this.reloadInteractions(sessionId, generation);
					this.scheduleInteractions(sessionId, generation);
					this.openStream(sessionId, cursor, generation);
				} catch (error) {
					if (controller.signal.aborted || generation !== this.selectionGeneration) return;
					this.report(error);
					this.patch({
						connection: "error",
						error: message(error)
					});
				}
			}
			/** Submit one ordinary fabric prompt to the selected runtime-capable session. */
			async submit(text) {
				const sessionId = this.state.selectedSessionId;
				if (this.disposed || !this.state.open || this.state.submitting || this.port.submit === void 0 || sessionId === void 0 || !this.canPrompt(sessionId) || text.trim() === "") return false;
				if (text.length > 12e3) {
					this.patch({ submissionError: "Prompt must be 12,000 characters or fewer" });
					return false;
				}
				const pending = this.pendingSubmission?.sessionId === sessionId && this.pendingSubmission.text === text ? this.pendingSubmission : {
					sessionId,
					text,
					operationId: this.operationId()
				};
				this.pendingSubmission = pending;
				this.patch({
					submitting: true,
					submissionError: void 0
				});
				try {
					await this.port.submit(pending.sessionId, pending.text, pending.operationId);
					if (!this.disposed) this.patch({
						submitting: false,
						submissionError: void 0
					});
					this.pendingSubmission = void 0;
					return true;
				} catch (error) {
					if (!this.disposed) {
						this.report(error);
						this.patch({
							submitting: false,
							submissionError: message(error)
						});
					}
					return false;
				}
			}
			/** Whether the selected public runtime session advertises queued prompt delivery. */
			canPrompt(sessionId) {
				return this.state.sessions.some((session) => session.sessionId === sessionId && session.capabilities.includes("queued-prompt-delivery"));
			}
			canInterrupt(sessionId) {
				return this.state.sessions.some((session) => session.sessionId === sessionId && session.capabilities.includes("interrupt-native-turn"));
			}
			canRespond(sessionId) {
				return this.state.sessions.some((session) => session.sessionId === sessionId && session.capabilities.includes("respond-interactions"));
			}
			canCreate() {
				return this.state.controlCapabilities.includes("create-codex-session");
			}
			async create(cwd) {
				if (this.port.create === void 0 || this.disposed || this.creating || !this.canCreate()) return false;
				const pending = this.pendingCreate?.cwd === cwd ? this.pendingCreate : {
					cwd,
					operationId: this.operationId()
				};
				this.pendingCreate = pending;
				this.creating = true;
				try {
					await this.port.create(pending.cwd, pending.operationId);
					this.pendingCreate = void 0;
					await this.refresh();
					return true;
				} catch (error) {
					this.report(error);
					this.patch({ error: message(error) });
					return false;
				} finally {
					this.creating = false;
				}
			}
			async interrupt(turnId) {
				const sessionId = this.state.selectedSessionId;
				if (this.port.interrupt === void 0 || sessionId === void 0 || this.disposed || !this.canInterrupt(sessionId)) return false;
				try {
					await this.port.interrupt(sessionId, turnId, this.operationId());
					return true;
				} catch (error) {
					this.report(error);
					this.patch({ error: message(error) });
					return false;
				}
			}
			async respondInteraction(interaction, decision, responseOverride) {
				if (this.port.respondInteraction === void 0 || interaction.sessionId !== this.state.selectedSessionId || !this.canRespond(interaction.sessionId)) return false;
				const response = responseOverride ?? interactionResponse(interaction.kind, decision);
				if (response === void 0) return false;
				try {
					await this.port.respondInteraction(interaction.sessionId, interaction.id, interaction.kind, response);
					await this.reloadInteractions(interaction.sessionId, this.selectionGeneration);
					return true;
				} catch (error) {
					this.report(error);
					this.patch({ error: message(error) });
					return false;
				}
			}
			async reloadInteractions(sessionId, generation) {
				if (this.port.interactions === void 0 || !this.canRespond(sessionId) || this.interactionLoading) return;
				this.interactionAbort?.abort();
				const controller = new AbortController();
				this.interactionAbort = controller;
				this.interactionLoading = true;
				try {
					const interactions = await this.port.interactions(sessionId, controller.signal);
					if (!this.disposed && !controller.signal.aborted && generation === this.selectionGeneration && sessionId === this.state.selectedSessionId) this.patch({ interactions });
				} catch (error) {
					if (!controller.signal.aborted && generation === this.selectionGeneration) this.report(error);
				} finally {
					if (this.interactionAbort === controller) this.interactionAbort = void 0;
					this.interactionLoading = false;
				}
			}
			scheduleInteractions(sessionId, generation) {
				if (this.disposed || generation !== this.selectionGeneration || !this.state.open || !this.canRespond(sessionId)) return;
				this.interactionTimer = setTimeout(async () => {
					this.interactionTimer = void 0;
					await this.reloadInteractions(sessionId, generation);
					this.scheduleInteractions(sessionId, generation);
				}, 1e3);
			}
			/** Poll the durable workbench mailbox only while its drawer is visible. */
			async reloadInbox() {
				if (this.port.listInbox === void 0 || this.disposed || !this.state.open) return;
				this.inboxAbort?.abort();
				const controller = new AbortController();
				this.inboxAbort = controller;
				const generation = this.inboxGeneration;
				this.patch({
					inboxLoading: true,
					inboxError: void 0
				});
				try {
					const snapshot = await this.port.listInbox(controller.signal);
					if (!this.disposed && this.state.open && !controller.signal.aborted && this.inboxAbort === controller && generation === this.inboxGeneration) this.patch({
						inbox: snapshot.messages,
						inboxLoading: false
					});
				} catch (error) {
					if (!controller.signal.aborted && !this.disposed && this.state.open && this.inboxAbort === controller && generation === this.inboxGeneration) {
						this.report(error);
						this.patch({
							inboxLoading: false,
							inboxError: message(error)
						});
					}
				} finally {
					if (this.inboxAbort === controller) this.inboxAbort = void 0;
				}
			}
			scheduleInbox() {
				if (this.disposed || !this.state.open || this.port.listInbox === void 0 || this.inboxTimer !== void 0) return;
				const generation = this.inboxGeneration;
				this.inboxTimer = setTimeout(async () => {
					this.inboxTimer = void 0;
					if (generation !== this.inboxGeneration) return;
					await this.reloadInbox();
					this.scheduleInbox();
				}, 3e3);
			}
			openStream(sessionId, cursor, generation) {
				const source = this.port.stream(sessionId, cursor);
				this.source = source;
				source.addEventListener("open", () => {
					if (!this.disposed && this.source === source && generation === this.selectionGeneration) this.patch({
						connection: "open",
						error: void 0
					});
				});
				source.addEventListener("error", () => {
					if (!this.disposed && this.source === source && generation === this.selectionGeneration) this.patch({ connection: "reconnecting" });
				});
				source.addEventListener("session_event", (event) => {
					if (this.disposed || this.source !== source || generation !== this.selectionGeneration) return;
					const decoded = decodeCrewForeignSessionEvent(event.data);
					if (decoded === void 0 || decoded.sessionId !== sessionId || decoded.cursor <= this.state.cursor) return;
					const events = mergeEvents(this.state.events, [decoded]);
					this.patch({
						events,
						cursor: latestCursor(events)
					});
				});
			}
			stopSelection() {
				this.source?.close();
				this.source = void 0;
				this.eventsAbort?.abort();
				this.eventsAbort = void 0;
				this.interactionAbort?.abort();
				this.interactionAbort = void 0;
				if (this.interactionTimer !== void 0) clearTimeout(this.interactionTimer);
				this.interactionTimer = void 0;
				this.interactionLoading = false;
			}
			patch(patch) {
				this.state = {
					...this.state,
					...patch
				};
				for (const listener of this.listeners) listener();
			}
		};
		/** Build a browser port that keeps the fabric on the DSH host side of the connection. */
		function createCrewSessionWorkbenchPort(input = {}) {
			const request = input.fetch ?? fetch;
			const eventSource = input.eventSource ?? ((url) => new EventSource(url));
			return {
				listSessions: async (signal) => decodeSnapshot(await fetchJson(request, CREW_SESSIONS_ENDPOINT, signal), decodeSessions),
				listEvents: async (sessionId, cursor, signal) => decodeSnapshot(await fetchJson(request, `${CREW_SESSION_EVENTS_ENDPOINT}?${new URLSearchParams({
					session_id: sessionId,
					cursor: String(cursor)
				})}`, signal), decodeEvents),
				listInbox: async (signal) => decodeSnapshot(await fetchJson(request, CREW_WORKBENCH_INBOX_ENDPOINT, signal), decodeInbox),
				stream: (sessionId, cursor) => eventSource(`${CREW_SESSION_EVENTS_STREAM_ENDPOINT}?${new URLSearchParams({
					session_id: sessionId,
					cursor: String(cursor)
				})}`),
				submit: async (sessionId, text, operationId) => decodeSubmission(await fetchJson(request, CREW_SESSION_PROMPT_ENDPOINT, void 0, {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						session_id: sessionId,
						text,
						operation_id: operationId
					})
				})),
				controlCapabilities: async () => {
					const value = object(await fetchJson(request, CREW_CODEX_CAPABILITIES_ENDPOINT));
					const capabilities = Array.isArray(value?.capabilities) && value.capabilities.every((item) => typeof item === "string") ? value.capabilities : void 0;
					if (capabilities === void 0) throw new Error("received invalid Codex capabilities");
					return capabilities;
				},
				create: async (cwd, operationId) => {
					const sessionId = text(object(await fetchJson(request, CREW_CODEX_CREATE_ENDPOINT, void 0, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							cwd,
							operation_id: operationId
						})
					}))?.sessionId);
					if (sessionId === void 0) throw new Error("received an invalid Codex create response");
					return { sessionId };
				},
				interrupt: async (sessionId, turnId, operationId) => {
					await fetchJson(request, CREW_CODEX_INTERRUPT_ENDPOINT, void 0, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							session_id: sessionId,
							turn_id: turnId,
							operation_id: operationId
						})
					});
				},
				interactions: async (sessionId, signal) => {
					const value = object(await fetchJson(request, `${CREW_CODEX_INTERACTIONS_ENDPOINT}?${new URLSearchParams({ session_id: sessionId })}`, signal));
					const values = Array.isArray(value?.interactions) ? value.interactions.map(decodeInteraction) : void 0;
					if (values === void 0 || values.some((item) => item === void 0)) throw new Error("received an invalid Codex interaction response");
					return values;
				},
				respondInteraction: async (sessionId, id, method, response) => {
					await fetchJson(request, CREW_CODEX_RESPOND_ENDPOINT, void 0, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({
							session_id: sessionId,
							id,
							method,
							response
						})
					});
				}
			};
		}
		/** Parse one named SSE data item and discard malformed or private upstream data. */
		function decodeCrewForeignSessionEvent(value) {
			let parsed = value;
			if (typeof value === "string") try {
				parsed = JSON.parse(value);
			} catch {
				return;
			}
			return decodeEvent(parsed);
		}
		/** Parse explicit session list DTOs and ignore unknown upstream keys. */
		function decodeSessions(value) {
			const record = object(value);
			if (!Array.isArray(record?.sessions)) return void 0;
			const sessions = record.sessions.map(decodeSession);
			return sessions.some((session) => session === void 0) ? void 0 : { sessions };
		}
		/** Parse explicit event-history DTOs and ignore unknown upstream keys. */
		function decodeEvents(value) {
			const record = object(value);
			if (!Array.isArray(record?.events)) return void 0;
			const events = record.events.map(decodeEvent);
			return events.some((event) => event === void 0) ? void 0 : { events };
		}
		/** Parse an explicit workbench mailbox response and discard unknown server fields. */
		function decodeInbox(value) {
			const record = object(value);
			if (!Array.isArray(record?.messages)) return void 0;
			const messages = record.messages.map((item) => {
				const entry = object(item);
				const messageId = text(entry?.messageId);
				const deliveryId = text(entry?.deliveryId);
				const state = text(entry?.state);
				const sender = text(entry?.sender);
				const body = text(entry?.body);
				const createdAt = text(entry?.createdAt);
				const replyToMessageId = text(entry?.replyToMessageId);
				return messageId === void 0 || deliveryId === void 0 || state === void 0 || sender === void 0 || body === void 0 || createdAt === void 0 ? void 0 : {
					messageId,
					deliveryId,
					state,
					sender,
					body,
					createdAt,
					...replyToMessageId === void 0 ? {} : { replyToMessageId }
				};
			});
			return messages.some((item) => item === void 0) ? void 0 : { messages };
		}
		async function fetchJson(request, url, signal, init = {}) {
			const response = await request(url, {
				cache: "no-store",
				...init,
				...signal === void 0 ? {} : { signal }
			});
			if (!response.ok) throw new Error(`request failed (${String(response.status)})`);
			return await response.json();
		}
		function decodeSnapshot(value, decoder) {
			const decoded = decoder(value);
			if (decoded === void 0) throw new Error("received an invalid Crew session response");
			return decoded;
		}
		function decodeSubmission(value) {
			const record = object(value);
			const messageId = text(record?.messageId);
			const replayed = record?.replayed;
			if (messageId === void 0 || typeof replayed !== "boolean") throw new Error("received an invalid Crew prompt response");
			return {
				messageId,
				replayed
			};
		}
		function decodeInteraction(value) {
			const record = object(value);
			const id = text(record?.id);
			const sessionId = text(record?.session_id);
			const kind = text(record?.kind);
			const createdAt = text(record?.created_at);
			const status = text(record?.status);
			const capability = text(record?.capability);
			const allowedDecisions = Array.isArray(record?.allowed_decisions) && record.allowed_decisions.every((item) => typeof item === "string") ? record.allowed_decisions : void 0;
			const prompt = text(record?.prompt);
			const questions = Array.isArray(record?.questions) ? record.questions.map(decodeQuestion) : [];
			const permissions = record?.permissions === void 0 ? [] : Array.isArray(record.permissions) && record.permissions.every((item) => typeof item === "string") ? record.permissions : void 0;
			if (id === void 0 || sessionId === void 0 || kind === void 0 || createdAt === void 0 || status !== "pending" || capability !== "respond-interactions" || allowedDecisions === void 0 || questions.some((question) => question === void 0) || permissions === void 0) return void 0;
			return {
				id,
				sessionId,
				kind,
				createdAt,
				status,
				capability,
				allowedDecisions,
				questions,
				permissions,
				...prompt === void 0 ? {} : { prompt }
			};
		}
		function decodeQuestion(value) {
			const record = object(value);
			const id = text(record?.id);
			const header = text(record?.header);
			const question = text(record?.question);
			const sensitive = record?.sensitive === true;
			const options = Array.isArray(record?.options) ? record.options.map((option) => {
				const item = object(option);
				const label = text(item?.label);
				const description = text(item?.description);
				return label === void 0 || description === void 0 ? void 0 : {
					label,
					description
				};
			}) : [];
			if (id === void 0 || header === void 0 || question === void 0 || options.some((option) => option === void 0)) return void 0;
			return {
				id,
				header,
				question,
				sensitive,
				options
			};
		}
		function interactionResponse(kind, decision) {
			if ((kind === "item/commandExecution/requestApproval" || kind === "item/fileChange/requestApproval") && (decision === "accept" || decision === "decline" || decision === "cancel")) return { decision };
			if (kind === "item/permissions/requestApproval" && decision === "deny") return {
				permissions: {},
				scope: "turn"
			};
			if (kind === "item/tool/requestUserInput" && decision === "submit-empty") return { answers: {} };
			if (kind === "mcpServer/elicitation/request" && (decision === "decline" || decision === "cancel")) return {
				action: decision,
				content: null
			};
		}
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
			const capabilities = Array.isArray(record?.capabilities) && record.capabilities.every((item) => typeof item === "string") ? record.capabilities : void 0;
			if (sessionId === void 0 || adapterId === void 0 || label === void 0 || status === void 0 || revision === void 0 || createdAt === void 0 || updatedAt === void 0 || capabilities === void 0) return void 0;
			return {
				sessionId,
				adapterId,
				label,
				status,
				capabilities,
				revision,
				createdAt,
				updatedAt,
				...location === void 0 ? {} : { location }
			};
		}
		function decodeEvent(value) {
			const record = object(value);
			const eventId = text(field(record, "eventId", "event_id"));
			const sessionId = text(field(record, "sessionId", "session_id"));
			const sequence = integer(record?.sequence);
			const cursor = integer(record?.cursor);
			const eventType = text(field(record, "eventType", "event_type"));
			const occurredAt = text(field(record, "occurredAt", "occurred_at"));
			const recordedAt = text(field(record, "recordedAt", "recorded_at"));
			if (eventId === void 0 || sessionId === void 0 || sequence === void 0 || cursor === void 0 || eventType === void 0 || occurredAt === void 0 || recordedAt === void 0 || !("payload" in (record ?? {}))) return void 0;
			const payload = safePayload(record.payload);
			return payload === void 0 ? void 0 : {
				eventId,
				sessionId,
				sequence,
				cursor,
				eventType,
				payload,
				occurredAt,
				recordedAt
			};
		}
		function mergeEvents(existing, incoming) {
			const byCursor = new Map(existing.map((event) => [event.cursor, event]));
			for (const event of incoming) if (!byCursor.has(event.cursor)) byCursor.set(event.cursor, event);
			return [...byCursor.values()].sort((left, right) => left.cursor - right.cursor);
		}
		function latestCursor(events) {
			return events.at(-1)?.cursor ?? 0;
		}
		function object(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		function field(record, camel, snake) {
			return record?.[camel] ?? record?.[snake];
		}
		function text(value) {
			return typeof value === "string" ? value : void 0;
		}
		function integer(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
		}
		function message(error) {
			return error instanceof Error ? error.message : "Crew session request failed";
		}
		function safePayload(value) {
			if (value === null || typeof value === "string" || typeof value === "boolean") return value;
			if (typeof value === "number") return Number.isFinite(value) ? value : void 0;
			if (Array.isArray(value)) {
				const items = value.map(safePayload);
				return items.some((item) => item === void 0) ? void 0 : items;
			}
			const record = object(value);
			if (record === void 0) return void 0;
			const projected = {};
			for (const [key, entry] of Object.entries(record)) {
				if (key === "adapter_key" || key === "target_ref" || key === "lease_token" || key.endsWith("_token")) continue;
				const nested = safePayload(entry);
				if (nested === void 0) return void 0;
				projected[key] = nested;
			}
			return projected;
		}
		//#endregion
		//#region lib/client/CrewSessionWorkbench.styles.js
		/** Disposable styles for the independent foreign-session workbench. */
		const crewSessionWorkbenchCss = String.raw`
.dshCrewSessionsTrigger{display:inline-flex;min-height:32px;align-items:center;gap:8px;border:0;border-radius:8px;padding:6px 10px;color:var(--dsw-alias-label-primary);background:transparent;cursor:pointer}.dshCrewSessionsTrigger:hover,.dshCrewSessionsTrigger:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.dshCrewSessionsOverlay{position:fixed;inset:0;z-index:2147483001;display:flex;justify-content:flex-end;pointer-events:none}.dshCrewSessionsDrawer{box-sizing:border-box;width:min(920px,calc(100vw - 80px));height:100%;overflow:hidden;pointer-events:auto;border-left:1px solid var(--dsw-alias-border-l2);padding:20px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-shadow-lv3)}
.dshCrewSessionsHeader,.dshCrewSessionsToolbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.dshCrewSessionsHeader h2,.dshCrewSessionsHeader p,.dshCrewSessionsEmpty,.dshCrewSessionEvent p{margin:0}.dshCrewSessionsHeader p,.dshCrewSessionsMuted{color:var(--dsw-alias-label-secondary);font-size:13px}.dshCrewSessionsButton{min-height:32px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:6px 10px;font:inherit;color:inherit;background:transparent;cursor:pointer}.dshCrewSessionsButton:hover,.dshCrewSessionsButton:focus-visible,.dshCrewSessionList button:hover,.dshCrewSessionList button:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.dshCrewSessionsGrid{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);gap:16px;height:calc(100% - 74px);margin-top:18px}.dshCrewSessionList,.dshCrewSessionTimeline{min-height:0;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;background:var(--dsw-alias-bg-layer-1)}.dshCrewSessionList{overflow:auto;padding:8px}.dshCrewSessionList button{display:grid;width:100%;gap:4px;border:0;border-radius:7px;padding:10px;text-align:left;font:inherit;color:inherit;background:transparent;cursor:pointer}.dshCrewSessionList button[aria-current=true]{background:var(--dsw-alias-interactive-bg-hover)}.dshCrewSessionList small{color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}.dshCrewSessionTimeline{display:grid;grid-template-rows:auto minmax(0,1fr);overflow:hidden}.dshCrewSessionsToolbar{padding:12px;border-bottom:1px solid var(--dsw-alias-border-l2)}.dshCrewSessionEvents{display:grid;align-content:start;gap:10px;overflow:auto;padding:12px}.dshCrewSessionEvent{display:grid;gap:7px;border-left:2px solid var(--dsw-alias-brand-primary);padding:0 0 0 10px}.dshCrewSessionEvent header{display:flex;justify-content:space-between;gap:12px;font-size:13px}.dshCrewSessionEvent time,.dshCrewSessionEvent small{color:var(--dsw-alias-label-secondary);font-size:12px}.dshCrewSessionEvent pre{max-height:240px;overflow:auto;margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;color:var(--dsw-alias-label-secondary)}.dshCrewSessionsState{border-radius:999px;padding:2px 8px;font-size:12px;background:var(--dsw-alias-bg-module-platform)}.dshCrewSessionsState[data-state=error]{color:var(--dsw-alias-state-error-primary)}
.dshCrewSessionTimeline{grid-template-rows:auto auto minmax(0,1fr)}.dshCrewSessionPrompt{display:grid;gap:7px;padding:12px;border-bottom:1px solid var(--dsw-alias-border-l2)}.dshCrewSessionPrompt label{font-size:13px;font-weight:600}.dshCrewSessionPrompt textarea{box-sizing:border-box;width:100%;min-height:72px;resize:vertical;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;padding:8px;font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2)}.dshCrewSessionPrompt>div{display:flex;align-items:center;gap:8px}.dshCrewSessionsError{color:var(--dsw-alias-state-error-primary);font-size:12px}
.dshCrewWorkbenchInbox{max-height:min(32vh,320px);overflow:auto}
@media(max-width:720px){.dshCrewSessionsDrawer{width:100%;padding:16px}.dshCrewSessionsGrid{grid-template-columns:1fr;grid-template-rows:minmax(150px,35%) minmax(0,1fr);height:calc(100% - 84px)}}
`;
		/** Install one owned style node for the current client plugin fiber. */
		function installCrewSessionWorkbenchStyle(target) {
			const style = target.createElement("style");
			style.dataset.plugin = "dsh-crew-messaging";
			style.dataset.pluginCss = "dsh-crew-messaging/foreign-session-workbench";
			style.textContent = crewSessionWorkbenchCss;
			target.head.appendChild(style);
			return () => {
				style.remove();
			};
		}
		//#endregion
		//#region lib/client/CrewSessionWorkbenchView.js
		/** React views for the additive foreign-session drawer. */
		const returnTargets = /* @__PURE__ */ new WeakMap();
		/** Render the Crew sessions action in the DSH sidebar footer. */
		function CrewSessionWorkbenchTrigger({ wide, controller }) {
			const state = useStore(controller);
			const open = (event) => {
				returnTargets.set(controller, event.currentTarget);
				controller.open();
			};
			return (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "dshCrewSessionsTrigger",
				"aria-label": "Open Crew sessions",
				"aria-haspopup": "dialog",
				"aria-expanded": state.open,
				onClick: open,
				children: wide ? "Crew sessions" : "Crew"
			});
		}
		/** Render the independent session browser and event timeline in the shell overlay. */
		function CrewSessionWorkbenchOverlay({ controller }) {
			const state = useStore(controller);
			const drawer = (0, react.useRef)(null);
			const closeButton = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (!state.open || drawer.current === null) return;
				closeButton.current?.focus();
				const onKeyDown = (event) => {
					if (event.key !== "Escape") return;
					event.preventDefault();
					controller.close();
				};
				const target = drawer.current.ownerDocument;
				target.addEventListener("keydown", onKeyDown);
				return () => {
					target.removeEventListener("keydown", onKeyDown);
					const trigger = returnTargets.get(controller);
					if (trigger?.isConnected) trigger.focus();
				};
			}, [controller, state.open]);
			if (!state.open) return null;
			const selected = state.sessions.find((session) => session.sessionId === state.selectedSessionId);
			return (0, react_jsx_runtime.jsx)("div", {
				className: "dshCrewSessionsOverlay",
				role: "presentation",
				children: (0, react_jsx_runtime.jsxs)("section", {
					ref: drawer,
					className: "dshCrewSessionsDrawer",
					role: "dialog",
					"aria-modal": "false",
					"aria-labelledby": "dsh-crew-sessions-title",
					tabIndex: -1,
					children: [(0, react_jsx_runtime.jsxs)("header", {
						className: "dshCrewSessionsHeader",
						children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("h2", {
							id: "dsh-crew-sessions-title",
							children: "Crew sessions"
						}), (0, react_jsx_runtime.jsx)("p", { children: "Sessions published by external runtime adapters." })] }), (0, react_jsx_runtime.jsx)("button", {
							ref: closeButton,
							type: "button",
							className: "dshCrewSessionsButton",
							onClick: () => controller.close(),
							children: "Close"
						})]
					}), (0, react_jsx_runtime.jsxs)("div", {
						className: "dshCrewSessionsGrid",
						children: [(0, react_jsx_runtime.jsx)("nav", {
							className: "dshCrewSessionList",
							"aria-label": "Crew sessions",
							children: state.loading ? (0, react_jsx_runtime.jsx)("p", {
								className: "dshCrewSessionsEmpty",
								children: "Loading sessions…"
							}) : state.sessions.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
								className: "dshCrewSessionsEmpty",
								children: "No external sessions are currently published."
							}) : state.sessions.map((session) => (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								"aria-current": session.sessionId === state.selectedSessionId || void 0,
								onClick: () => {
									controller.select(session.sessionId);
								},
								children: [(0, react_jsx_runtime.jsx)("strong", { children: session.label }), (0, react_jsx_runtime.jsxs)("small", { children: [
									session.adapterId,
									" · ",
									session.status,
									session.location === void 0 ? "" : ` · ${session.location}`
								] })]
							}, session.sessionId))
						}), (0, react_jsx_runtime.jsxs)("section", {
							className: "dshCrewSessionTimeline",
							"aria-live": "polite",
							children: [
								(0, react_jsx_runtime.jsxs)("header", {
									className: "dshCrewSessionsToolbar",
									children: [(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("strong", { children: selected?.label ?? "Select a session" }), (0, react_jsx_runtime.jsx)("div", {
										className: "dshCrewSessionsMuted",
										children: selected === void 0 ? "No session selected" : selected.capabilities.join(", ") || "No published capabilities"
									})] }), (0, react_jsx_runtime.jsxs)("div", { children: [
										(0, react_jsx_runtime.jsx)("span", {
											className: "dshCrewSessionsState",
											"data-state": state.connection,
											children: state.connection
										}),
										" ",
										(0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "dshCrewSessionsButton",
											onClick: () => {
												controller.refresh();
											},
											children: "Refresh"
										})
									] })]
								}),
								(0, react_jsx_runtime.jsx)(CrewWorkbenchInbox, {
									loading: state.inboxLoading,
									error: state.inboxError,
									values: state.inbox
								}),
								(0, react_jsx_runtime.jsx)(CrewControls, {
									controller,
									selected
								}),
								(0, react_jsx_runtime.jsx)(CrewPrompt, {
									controller,
									enabled: selected !== void 0 && controller.canPrompt(selected.sessionId)
								}),
								(0, react_jsx_runtime.jsx)(CrewInteractions, {
									controller,
									values: state.interactions,
									enabled: selected !== void 0 && controller.canRespond(selected.sessionId)
								}),
								(0, react_jsx_runtime.jsxs)("div", {
									className: "dshCrewSessionEvents",
									children: [state.error === void 0 ? null : (0, react_jsx_runtime.jsx)("p", {
										className: "dshCrewSessionsEmpty",
										role: "status",
										children: state.error
									}), selected === void 0 ? (0, react_jsx_runtime.jsx)("p", {
										className: "dshCrewSessionsEmpty",
										children: "Choose a published session to inspect its timeline."
									}) : state.events.length === 0 && state.connection === "connecting" ? (0, react_jsx_runtime.jsx)("p", {
										className: "dshCrewSessionsEmpty",
										children: "Loading event history…"
									}) : state.events.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
										className: "dshCrewSessionsEmpty",
										children: "No events have been published for this session."
									}) : state.events.map((event) => (0, react_jsx_runtime.jsx)(EventRow, { event }, event.cursor))]
								})
							]
						})]
					})]
				})
			});
		}
		function CrewInteractions({ controller, values, enabled }) {
			if (!enabled || values.length === 0) return null;
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "dshCrewSessionPrompt",
				children: [(0, react_jsx_runtime.jsx)("strong", { children: "Pending Codex interactions" }), values.map((value) => (0, react_jsx_runtime.jsx)(InteractionCard, {
					controller,
					value
				}, value.id))]
			});
		}
		function CrewWorkbenchInbox({ loading, error, values }) {
			return (0, react_jsx_runtime.jsxs)("section", {
				className: "dshCrewSessionPrompt dshCrewWorkbenchInbox",
				children: [(0, react_jsx_runtime.jsx)("strong", { children: "Workbench inbox" }), loading ? (0, react_jsx_runtime.jsx)("p", {
					className: "dshCrewSessionsMuted",
					children: "Loading replies…"
				}) : error === void 0 ? values.length === 0 ? (0, react_jsx_runtime.jsx)("p", {
					className: "dshCrewSessionsMuted",
					children: "No messages have arrived for this workbench."
				}) : values.map((value) => (0, react_jsx_runtime.jsxs)("article", {
					className: "dshCrewSessionEvent",
					children: [
						(0, react_jsx_runtime.jsxs)("header", { children: [(0, react_jsx_runtime.jsx)("strong", { children: value.sender }), (0, react_jsx_runtime.jsx)("time", {
							dateTime: value.createdAt,
							children: value.createdAt
						})] }),
						(0, react_jsx_runtime.jsx)("p", { children: value.body }),
						(0, react_jsx_runtime.jsxs)("small", { children: [value.state, value.replyToMessageId === void 0 ? "" : ` · reply to ${value.replyToMessageId}`] })
					]
				}, value.deliveryId)) : (0, react_jsx_runtime.jsx)("p", {
					className: "dshCrewSessionsError",
					role: "status",
					children: error
				})]
			});
		}
		function InteractionCard({ controller, value }) {
			const [answers, setAnswers] = (0, react.useState)({});
			return (0, react_jsx_runtime.jsxs)("div", { children: [
				(0, react_jsx_runtime.jsxs)("small", { children: [value.kind, value.prompt === void 0 ? "" : ` · ${value.prompt}`] }),
				value.permissions.length === 0 ? null : (0, react_jsx_runtime.jsxs)("p", {
					className: "dshCrewSessionsMuted",
					children: [
						"Requested permissions: ",
						value.permissions.join(", "),
						". This workbench only offers no grant."
					]
				}),
				value.questions.map((question) => (0, react_jsx_runtime.jsxs)("label", { children: [
					question.header,
					": ",
					question.question,
					question.options.length > 0 ? (0, react_jsx_runtime.jsx)("select", {
						value: answers[question.id] ?? "",
						onChange: (event) => setAnswers((current) => ({
							...current,
							[question.id]: event.target.value
						})),
						children: question.options.map((option) => (0, react_jsx_runtime.jsxs)("option", {
							value: option.label,
							children: [
								option.label,
								" — ",
								option.description
							]
						}, option.label))
					}) : (0, react_jsx_runtime.jsx)("input", {
						type: question.sensitive ? "password" : "text",
						value: answers[question.id] ?? "",
						onChange: (event) => setAnswers((current) => ({
							...current,
							[question.id]: event.target.value
						}))
					})
				] }, question.id)),
				value.allowedDecisions.map((decision) => (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dshCrewSessionsButton",
					onClick: () => {
						const response = decision === "answer" ? { answers: Object.fromEntries(value.questions.map((question) => [question.id, { answers: [answers[question.id] ?? ""] }])) } : void 0;
						controller.respondInteraction(value, decision, response);
					},
					children: decision === "answer" ? "Submit answers" : decision
				}, decision))
			] });
		}
		function CrewControls({ controller, selected }) {
			const [turnId, setTurnId] = (0, react.useState)("");
			const create = controller.canCreate();
			const interrupt = selected !== void 0 && controller.canInterrupt(selected.sessionId);
			if (!create && !interrupt) return null;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: "dshCrewSessionPrompt",
				children: [create ? (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dshCrewSessionsButton",
					onClick: () => {
						controller.create("");
					},
					children: "New Codex session"
				}) : null, interrupt ? (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsxs)("label", { children: ["Active turn id ", (0, react_jsx_runtime.jsx)("input", {
					value: turnId,
					onChange: (event) => setTurnId(event.target.value)
				})] }), (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "dshCrewSessionsButton",
					disabled: turnId.trim() === "",
					onClick: () => {
						controller.interrupt(turnId);
					},
					children: "Interrupt turn"
				})] }) : null]
			});
		}
		function CrewPrompt({ controller, enabled }) {
			const state = useStore(controller);
			const [text, setText] = (0, react.useState)("");
			if (!enabled) return (0, react_jsx_runtime.jsx)("p", {
				className: "dshCrewSessionsMuted",
				children: "This runtime publishes history only; it cannot accept workbench prompts."
			});
			const submit = async (event) => {
				event.preventDefault();
				if (await controller.submit(text)) setText("");
			};
			return (0, react_jsx_runtime.jsxs)("form", {
				className: "dshCrewSessionPrompt",
				onSubmit: (event) => {
					submit(event);
				},
				children: [
					(0, react_jsx_runtime.jsx)("label", {
						htmlFor: "dsh-crew-session-prompt",
						children: "Send a queued prompt"
					}),
					(0, react_jsx_runtime.jsx)("textarea", {
						id: "dsh-crew-session-prompt",
						maxLength: CREW_SESSION_PROMPT_MAX_CHARS,
						value: text,
						onChange: (event) => setText(event.target.value),
						disabled: state.submitting
					}),
					(0, react_jsx_runtime.jsxs)("div", { children: [(0, react_jsx_runtime.jsx)("button", {
						type: "submit",
						className: "dshCrewSessionsButton",
						disabled: state.submitting || text.trim() === "",
						children: state.submitting ? "Submitting…" : "Queue prompt"
					}), state.submissionError === void 0 ? null : (0, react_jsx_runtime.jsx)("span", {
						className: "dshCrewSessionsError",
						role: "status",
						children: state.submissionError
					})] })
				]
			});
		}
		function EventRow({ event }) {
			return (0, react_jsx_runtime.jsxs)("article", {
				className: "dshCrewSessionEvent",
				children: [
					(0, react_jsx_runtime.jsxs)("header", { children: [(0, react_jsx_runtime.jsx)("strong", { children: event.eventType }), (0, react_jsx_runtime.jsx)("time", {
						dateTime: event.occurredAt,
						children: event.occurredAt
					})] }),
					(0, react_jsx_runtime.jsx)("pre", { children: formatPayload(event.payload) }),
					(0, react_jsx_runtime.jsxs)("small", { children: [
						"#",
						event.cursor,
						" · ",
						event.eventId
					] })
				]
			});
		}
		function useStore(controller) {
			return (0, react.useSyncExternalStore)((listener) => controller.subscribe(listener), () => controller.getSnapshot());
		}
		function formatPayload(value) {
			try {
				return JSON.stringify(value, null, 2);
			} catch {
				return String(value);
			}
		}
		//#endregion
		//#region lib/client/index.js
		/** Browser half of the Crew messaging plugin. */
		/** The services required to contribute a global Settings section. */
		const inject = ["slots"];
		/** Register independent messaging and review settings once the shell is present. */
		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "crew-messaging",
				order: 35,
				label: "Crew messaging"
			}, CrewCockpit));
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "crew-review",
				order: 36,
				label: "Crew review"
			}, CrewReviewPanel));
			const controller = new CrewSessionWorkbenchController(createCrewSessionWorkbenchPort(), (error) => {
				ctx.logger.warn(error);
			});
			ctx.effect(() => {
				if (typeof document === "undefined") return () => {
					controller.dispose();
				};
				const releaseStyle = installCrewSessionWorkbenchStyle(document);
				return () => {
					releaseStyle();
					controller.dispose();
				};
			}, "crew-messaging: foreign-session workbench lifecycle");
			const injected = () => ({ controller });
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "crew-messaging-sessions",
				order: 35,
				label: "Crew sessions",
				inject: injected
			}, CrewSessionWorkbenchTrigger));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "crew-messaging-sessions",
				order: 35,
				inject: injected
			}, CrewSessionWorkbenchOverlay));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map