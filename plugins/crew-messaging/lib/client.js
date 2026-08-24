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
		//#region lib/client/CrewSessionWorkbench.js
		/** Framework-independent foreign-session workbench state and same-origin browser port. */
		const CREW_SESSIONS_ENDPOINT = "/plugins/dsh-crew-messaging/sessions";
		const CREW_SESSION_EVENTS_ENDPOINT = "/plugins/dsh-crew-messaging/session-events";
		const CREW_SESSION_EVENTS_STREAM_ENDPOINT = "/plugins/dsh-crew-messaging/session-events/stream";
		const INITIAL = {
			open: false,
			loading: false,
			sessions: [],
			selectedSessionId: void 0,
			events: [],
			cursor: 0,
			connection: "closed",
			error: void 0
		};
		/**
		* Own selection fetches and one EventSource. Changing selection or disposing cancels both.
		*/
		var CrewSessionWorkbenchController = class {
			port;
			report;
			state = INITIAL;
			listeners = /* @__PURE__ */ new Set();
			source;
			listAbort;
			eventsAbort;
			selectionGeneration = 0;
			disposed = false;
			constructor(port, report = () => {}) {
				this.port = port;
				this.report = report;
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
			}
			/** Close the drawer and release all selection-specific browser resources. */
			close() {
				this.listAbort?.abort();
				this.listAbort = void 0;
				this.selectionGeneration += 1;
				this.stopSelection();
				this.patch({
					open: false,
					loading: false,
					selectedSessionId: void 0,
					events: [],
					cursor: 0,
					connection: "closed",
					error: void 0
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
					this.patch({
						sessions: snapshot.sessions,
						loading: false
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
						return;
					}
					if (selected !== current || this.state.events.length === 0) await this.select(selected);
				} catch (error) {
					if (controller.signal.aborted) return;
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
				stream: (sessionId, cursor) => eventSource(`${CREW_SESSION_EVENTS_STREAM_ENDPOINT}?${new URLSearchParams({
					session_id: sessionId,
					cursor: String(cursor)
				})}`)
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
		async function fetchJson(request, url, signal) {
			const response = await request(url, {
				cache: "no-store",
				signal
			});
			if (!response.ok) throw new Error(`request failed (${String(response.status)})`);
			return await response.json();
		}
		function decodeSnapshot(value, decoder) {
			const decoded = decoder(value);
			if (decoded === void 0) throw new Error("received an invalid Crew session response");
			return decoded;
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
		/** React views for the additive read-only foreign-session drawer. */
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
						}), (0, react_jsx_runtime.jsx)("p", { children: "Read-only sessions published by external runtime adapters." })] }), (0, react_jsx_runtime.jsx)("button", {
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
							children: [(0, react_jsx_runtime.jsxs)("header", {
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
							}), (0, react_jsx_runtime.jsxs)("div", {
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
							})]
						})]
					})]
				})
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
		/** Register the read-only Crew cockpit once the Settings shell is present. */
		function apply(ctx) {
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "crew-messaging",
				order: 35,
				label: "Crew"
			}, CrewCockpit));
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