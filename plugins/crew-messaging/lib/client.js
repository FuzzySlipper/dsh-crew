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
			secondary: "dsh-crew-secondary"
		};
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"dsh-crew-messaging/cockpit\"]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-crew-messaging";
			tag.dataset.pluginCss = "dsh-crew-messaging/cockpit";
			tag.textContent = `
.dsh-crew-cockpit{display:grid;gap:20px;color:var(--dsw-alias-label-primary)}.dsh-crew-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.dsh-crew-header h2,.dsh-crew-panel h3{margin:0}.dsh-crew-header p,.dsh-crew-empty{margin:6px 0 0;color:var(--dsw-alias-label-secondary)}.dsh-crew-status,.dsh-crew-rows{display:grid;gap:8px}.dsh-crew-status{grid-template-columns:repeat(3,minmax(0,1fr))}.dsh-crew-status>div,.dsh-crew-row,.dsh-crew-traffic-row,.dsh-crew-panel{border:1px solid var(--dsw-alias-border-light);border-radius:12px}.dsh-crew-status>div{display:grid;gap:4px;padding:12px}.dsh-crew-status span,.dsh-crew-row span,.dsh-crew-traffic-row span,.dsh-crew-traffic-row small,.dsh-crew-tuning dt{color:var(--dsw-alias-label-secondary);font-size:12px}.dsh-crew-panel{padding:14px}.dsh-crew-rows{margin-top:10px}.dsh-crew-row{display:grid;grid-template-columns:1fr auto auto;gap:12px;align-items:center;padding:10px}.dsh-crew-traffic{display:grid;gap:8px;margin-top:10px}.dsh-crew-traffic-row{display:grid;gap:6px;padding:10px}.dsh-crew-traffic-row>div{display:flex;justify-content:space-between;gap:12px}.dsh-crew-traffic-row p{margin:0;white-space:pre-wrap}.dsh-crew-tuning{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;margin:10px 0 0}.dsh-crew-tuning div{display:flex;justify-content:space-between;gap:8px}.dsh-crew-tuning dt,.dsh-crew-tuning dd{margin:0}.dsh-crew-good{color:var(--dsw-alias-success)}.dsh-crew-warning,.dsh-crew-error{color:var(--dsw-alias-warning)}.dsh-crew-secondary{width:fit-content;padding:6px 10px;border:1px solid var(--dsw-alias-border-light);border-radius:8px;background:transparent;color:inherit;cursor:pointer}@media(max-width:640px){.dsh-crew-status,.dsh-crew-tuning{grid-template-columns:1fr}}
`;
			document.head.appendChild(tag);
		}
		//#endregion
		//#region lib/client/CrewCockpit.js
		/** Read-only global Crew settings cockpit. */
		const CREW_DASHBOARD_ENDPOINT = "/plugins/dsh-crew-messaging/dashboard";
		const POLL_MS = 5e3;
		/** Decode the narrow response the Host projection owns. */
		function decodeCrewDashboard(value) {
			if (!isObject(value) || !isObject(value.fabric) || !isObject(value.adapter) || !isObject(value.tuning) || !Array.isArray(value.directory) || !Array.isArray(value.messages) || !Array.isArray(value.deliveries)) return void 0;
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
				}, POLL_MS);
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
							(0, react_jsx_runtime.jsx)(Status, {
								label: "Fabric",
								value: snapshot.fabric.status
							}),
							(0, react_jsx_runtime.jsx)(Status, {
								label: "Adapter",
								value: snapshot.adapter.stopped ? "stopped" : snapshot.adapter.initialized ? "running" : "starting"
							}),
							(0, react_jsx_runtime.jsx)(Status, {
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
		function Status({ label, value }) {
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
		function isObject(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function tuningValid(value) {
			return typeof value.leaseDuration === "string" && typeof value.renewMs === "number" && typeof value.pollMs === "number" && typeof value.claimDuration === "string" && typeof value.ttl === "string" && typeof value.acceptanceTimeoutMs === "number" && typeof value.acceptancePollMs === "number";
		}
		function directoryEntry(value) {
			return isObject(value) && typeof value.address === "string" && (value.status === "routable" || value.status === "ambiguous" || value.status === "conflict") && (value.source === "configured" || value.source === "session-title") ? [{
				address: value.address,
				status: value.status,
				source: value.source
			}] : [];
		}
		function messageSummary(value) {
			return isObject(value) && typeof value.id === "string" && typeof value.from === "string" && typeof value.to === "string" && typeof value.createdAt === "string" && typeof value.preview === "string" && (value.replyTo === void 0 || typeof value.replyTo === "string") ? [{
				id: value.id,
				from: value.from,
				to: value.to,
				createdAt: value.createdAt,
				preview: value.preview,
				...value.replyTo === void 0 ? {} : { replyTo: value.replyTo }
			}] : [];
		}
		function deliverySummary(value) {
			return isObject(value) && typeof value.id === "string" && typeof value.messageId === "string" && typeof value.recipient === "string" && typeof value.state === "string" && (value.action === void 0 || typeof value.action === "string") && (value.updatedAt === void 0 || typeof value.updatedAt === "string") ? [{
				id: value.id,
				messageId: value.messageId,
				recipient: value.recipient,
				state: value.state,
				...value.action === void 0 ? {} : { action: value.action },
				...value.updatedAt === void 0 ? {} : { updatedAt: value.updatedAt }
			}] : [];
		}
		//#endregion
		//#region lib/client/index.js
		/** Browser half of the Crew messaging plugin. */
		/** The services required to contribute a global Settings section. */
		const inject = ["slots"];
		/** Register the read-only Crew cockpit once the Settings shell is present. */
		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "crew-messaging",
				order: 35,
				label: "Crew"
			}, CrewCockpit));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map