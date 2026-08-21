import { Service } from "@deepseek-ai/cordis";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { resolveSessionPreset } from "@deepseek-ai/dsh-agent-presets";
import { defineTool } from "@deepseek-ai/dsh-tools";
//#region src/http.ts
var FabricError = class extends Error {
	code;
	constructor(code, message = `fabric ${code}`) {
		super(message);
		this.code = code;
	}
};
/** Small fetch client; all validation is at this JSON/process boundary. */
var FabricClient = class {
	baseUrl;
	request;
	constructor(baseUrl, request = fetch) {
		this.baseUrl = baseUrl;
		this.request = request;
	}
	async call(path, method = "GET", body) {
		const response = await this.request(new URL(path, this.baseUrl), {
			method,
			...body === void 0 ? {} : {
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body)
			}
		});
		const value = await response.json().catch(() => ({}));
		if (!response.ok) throw new FabricError(typeof value === "object" && value !== null && "code" in value && typeof value.code === "string" ? value.code : `http_${response.status}`);
		return value;
	}
	register(adapterId, instanceId, leaseDuration) {
		return this.call("/v1/adapters/register", "POST", {
			adapter_id: adapterId,
			instance_id: instanceId,
			lease_duration: leaseDuration
		});
	}
	renew(adapterId, leaseToken, leaseDuration) {
		return this.call("/v1/adapters/renew", "POST", {
			adapter_id: adapterId,
			lease_token: leaseToken,
			lease_duration: leaseDuration
		});
	}
	listBindings() {
		return this.call("/v1/addresses");
	}
	putBinding(address, body) {
		return this.call(`/v1/addresses/${encodeURIComponent(address)}/binding`, "PUT", body);
	}
	submit(body) {
		return this.call("/v1/messages", "POST", body);
	}
	claim(body) {
		return this.call("/v1/deliveries/claim", "POST", body);
	}
	begin(deliveryId, body) {
		return this.call(`/v1/deliveries/${encodeURIComponent(deliveryId)}/begin-dispatch`, "POST", body);
	}
	release(deliveryId, body) {
		return this.call(`/v1/deliveries/${encodeURIComponent(deliveryId)}/release`, "POST", body);
	}
	acknowledge(deliveryId, body) {
		return this.call(`/v1/deliveries/${encodeURIComponent(deliveryId)}/acknowledge`, "POST", body);
	}
	unknown(deliveryId, body) {
		return this.call(`/v1/deliveries/${encodeURIComponent(deliveryId)}/outcome-unknown`, "POST", body);
	}
	deliveries() {
		return this.call("/v1/deliveries");
	}
};
//#endregion
//#region src/protocol.ts
const capabilities = [
	"deliver_when_idle",
	"durable_next_turn",
	"wake_inactive"
];
/** Stable operation identities never contain the lease token. */
function operation(deliveryId, action) {
	return `dsh-crew:${deliveryId}:${action}`;
}
function nativeAttempt(deliveryId) {
	return `dsh-crew:${deliveryId}:native`;
}
//#endregion
//#region src/service.ts
const defaults = {
	adapterId: "dsh-crew-messaging",
	instanceId: "dsh-crew-messaging-local",
	leaseDuration: "2m",
	renewMs: 45e3,
	pollMs: 1e3,
	claimDuration: "45s",
	ttl: "24h",
	acceptanceTimeoutMs: 1e3,
	acceptancePollMs: 10
};
/** A leased FIFO pump that only delivers an immutable fabric envelope once DSH accepted it. */
var CrewMessagingService = class {
	fabric;
	runtime;
	config;
	tails = /* @__PURE__ */ new Map();
	lease;
	leaseRenewedAt = 0;
	initialized = false;
	stopped = false;
	timer;
	inFlight = /* @__PURE__ */ new Set();
	disposeStatus;
	constructor(fabric, runtime, config = {}) {
		this.fabric = fabric;
		this.runtime = runtime;
		this.config = {
			...defaults,
			url: config.url ?? "http://127.0.0.1:8787",
			bindings: config.bindings ?? [],
			...config
		};
		validateBindings(this.config.bindings);
		this.disposeStatus = runtime.onStatus((agent) => {
			if (agent.status === "idle") this.observe(this.pumpSession(agent.sessionId));
		});
	}
	async start() {
		try {
			await this.initialize();
		} finally {
			this.schedule();
		}
	}
	async dispose() {
		this.stopped = true;
		if (this.timer !== void 0) clearTimeout(this.timer);
		this.disposeStatus();
		while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
	}
	addresses(sessionId) {
		return this.config.bindings.filter((binding) => binding.sessionId === sessionId).map((binding) => binding.address);
	}
	async send(sessionId, callId, recipientAddress, text, replyToMessageId) {
		const senderAddress = this.addresses(sessionId)[0];
		if (senderAddress === void 0) throw new Error("crew messaging: calling session is not bound");
		const lease = await this.ensureLease();
		const result = await this.fabric.submit({
			producer_id: this.config.adapterId,
			lease_token: lease.lease_token,
			operation_id: `${sessionId}:${callId}`,
			sender_address: senderAddress,
			recipient_address: recipientAddress,
			body: text,
			activation_policy: "wake_when_idle",
			ttl: this.config.ttl,
			...replyToMessageId === void 0 ? {} : { reply_to_message_id: replyToMessageId }
		});
		return {
			messageId: result.message.message_id,
			replayed: result.replayed
		};
	}
	schedule() {
		if (!this.stopped) this.timer = setTimeout(() => {
			this.timer = void 0;
			this.observe(this.tick());
		}, this.config.pollMs);
	}
	async tick() {
		try {
			if (!this.initialized) {
				await this.initialize();
				return;
			}
			await this.ensureLease();
			await Promise.all(this.config.bindings.map((binding) => this.pumpSession(binding.sessionId)));
		} finally {
			this.schedule();
		}
	}
	async initialize() {
		await this.ensureLease();
		await this.bind();
		await this.reconcile();
		this.initialized = true;
	}
	async ensureLease() {
		if (this.lease === void 0) {
			this.lease = await this.fabric.register(this.config.adapterId, this.config.instanceId, this.config.leaseDuration);
			this.leaseRenewedAt = Date.now();
		} else if (Date.now() - this.leaseRenewedAt >= this.config.renewMs) {
			this.lease = await this.fabric.renew(this.config.adapterId, this.lease.lease_token, this.config.leaseDuration);
			this.leaseRenewedAt = Date.now();
		}
		return this.lease;
	}
	async bind() {
		const lease = await this.ensureLease();
		const existing = await this.fabric.listBindings();
		for (const wanted of this.config.bindings) {
			const current = existing.addresses.find((binding) => binding.address === wanted.address);
			if (current?.bound && current.adapter_id === this.config.adapterId && current.target_ref === wanted.sessionId && sameCapabilities(current)) continue;
			await this.fabric.putBinding(wanted.address, {
				actor_adapter_id: this.config.adapterId,
				lease_token: lease.lease_token,
				adapter_id: this.config.adapterId,
				target_ref: wanted.sessionId,
				capabilities,
				...current === void 0 ? {} : { expected_revision: current.revision }
			});
		}
	}
	pumpSession(sessionId) {
		const tail = (this.tails.get(sessionId) ?? Promise.resolve()).catch(() => {}).then(() => this.pumpOnce(sessionId));
		this.tails.set(sessionId, tail);
		return tail.finally(() => {
			if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId);
		});
	}
	async pumpOnce(sessionId) {
		const binding = this.config.bindings.find((candidate) => candidate.sessionId === sessionId);
		if (binding === void 0 || this.stopped) return;
		const lease = await this.ensureLease();
		let agent = this.runtime.live(sessionId);
		const availability = agent?.status === "running" ? "busy" : agent === void 0 ? "inactive" : "idle";
		const claimed = await this.fabric.claim({
			adapter_id: this.config.adapterId,
			lease_token: lease.lease_token,
			operation_id: operation(`${binding.address}:${Date.now()}`, "claim"),
			recipient_address: binding.address,
			recipient_generation: await this.generation(binding.address),
			availability,
			claim_duration: this.config.claimDuration
		});
		if (!claimed.claimed || claimed.delivery === void 0 || claimed.message === void 0 || claimed.claim_token === void 0) return;
		await this.dispatch(claimed, sessionId);
	}
	async generation(address) {
		const binding = (await this.fabric.listBindings()).addresses.find((item) => item.address === address);
		if (binding === void 0) throw new Error(`crew messaging: binding ${address} disappeared`);
		return binding.generation;
	}
	async dispatch(claimed, sessionId) {
		const delivery = claimed.delivery;
		const envelope = claimed.message;
		const attempt = nativeAttempt(delivery.delivery_id);
		const lease = await this.ensureLease();
		let agent;
		try {
			agent = this.runtime.live(sessionId);
			if (agent === void 0) agent = await this.runtime.resume(sessionId);
		} catch {
			await this.release(delivery.delivery_id, claimed.claim_token, lease.lease_token);
			return;
		}
		if (agent === void 0) {
			await this.release(delivery.delivery_id, claimed.claim_token, lease.lease_token);
			return;
		}
		await this.fabric.begin(delivery.delivery_id, {
			adapter_id: this.config.adapterId,
			lease_token: lease.lease_token,
			operation_id: operation(delivery.delivery_id, "begin"),
			claim_token: claimed.claim_token,
			native_attempt_ref: attempt
		});
		try {
			agent.followup(this.runtime.message(delivery, envelope));
			if (!await this.runtime.flush(agent) || !await this.accepted(sessionId, delivery.delivery_id, this.config.acceptanceTimeoutMs)) throw new Error("native acceptance was not durable");
			await this.fabric.acknowledge(delivery.delivery_id, {
				adapter_id: this.config.adapterId,
				lease_token: lease.lease_token,
				operation_id: operation(delivery.delivery_id, "ack"),
				native_attempt_ref: attempt
			});
		} catch {
			await this.fabric.unknown(delivery.delivery_id, {
				adapter_id: this.config.adapterId,
				lease_token: lease.lease_token,
				operation_id: operation(delivery.delivery_id, "unknown"),
				native_attempt_ref: attempt
			});
		}
	}
	release(deliveryId, claimToken, leaseToken) {
		return this.fabric.release(deliveryId, {
			adapter_id: this.config.adapterId,
			lease_token: leaseToken,
			operation_id: operation(deliveryId, "release"),
			claim_token: claimToken
		});
	}
	async accepted(sessionId, deliveryId, waitMs = 0) {
		const deadline = Date.now() + waitMs;
		while (true) {
			if ((await this.runtime.inspect(sessionId))?.some((message) => message.source.kind === "crew-messaging" && message.source.deliveryId === deliveryId) ?? false) return true;
			const remaining = deadline - Date.now();
			if (remaining <= 0) return false;
			await new Promise((resolve) => setTimeout(resolve, Math.min(this.config.acceptancePollMs, remaining)));
		}
	}
	async reconcile() {
		const values = await this.fabric.deliveries();
		for (const delivery of values.deliveries.filter((item) => item.state === "dispatching" && item.claim_owner_adapter_id === this.config.adapterId && item.native_attempt_ref === nativeAttempt(item.delivery_id))) {
			const binding = this.config.bindings.find((item) => item.address === delivery.recipient_address);
			if (binding === void 0) continue;
			const accepted = await this.accepted(binding.sessionId, delivery.delivery_id);
			const lease = await this.ensureLease();
			const body = {
				adapter_id: this.config.adapterId,
				lease_token: lease.lease_token,
				operation_id: operation(delivery.delivery_id, accepted ? "ack" : "unknown"),
				native_attempt_ref: nativeAttempt(delivery.delivery_id)
			};
			if (!accepted) {
				await this.fabric.unknown(delivery.delivery_id, body);
				continue;
			}
			const live = this.runtime.live(binding.sessionId);
			if (live !== void 0 && !await this.runtime.flush(live)) {
				await this.fabric.unknown(delivery.delivery_id, body);
				continue;
			}
			await this.fabric.acknowledge(delivery.delivery_id, body);
		}
	}
	/** Track background work and contain its rejection at timer/event boundaries. */
	observe(work) {
		const settled = work.catch(() => {}).finally(() => {
			this.inFlight.delete(settled);
		});
		this.inFlight.add(settled);
	}
};
function sameCapabilities(binding) {
	return binding.capabilities.length === capabilities.length && capabilities.every((value) => binding.capabilities.includes(value));
}
function validateBindings(bindings) {
	const addresses = /* @__PURE__ */ new Set();
	const sessions = /* @__PURE__ */ new Set();
	for (const binding of bindings) {
		if (addresses.has(binding.address)) throw new Error(`crew messaging: duplicate address "${binding.address}"`);
		if (sessions.has(binding.sessionId)) throw new Error(`crew messaging: duplicate sessionId "${binding.sessionId}"`);
		addresses.add(binding.address);
		sessions.add(binding.sessionId);
	}
}
//#endregion
//#region src/tools.ts
const addressOutput = {
	type: "object",
	additionalProperties: false,
	properties: { addresses: {
		type: "array",
		required: true,
		items: { type: "string" }
	} }
};
const sendOutput = {
	type: "object",
	additionalProperties: false,
	properties: {
		message_id: {
			type: "string",
			required: true
		},
		replayed: {
			type: "boolean",
			required: true
		}
	}
};
function caller(agent, name) {
	if (agent === void 0) throw new Error(`${name} requires a calling Agent`);
	return agent;
}
function output(value) {
	return [{
		type: "text",
		text: JSON.stringify(value)
	}];
}
/** Install tools only for roots named by explicit adapter bindings. */
function installScopedTools(ctx, service) {
	const installed = /* @__PURE__ */ new Map();
	const install = (agent) => {
		if (installed.has(agent) || !ctx.agents.roots().includes(agent) || service.addresses(String(agent.id)).length === 0) return;
		const disposers = [];
		try {
			disposers.push(agent.ctx.systemPrompt.section({
				name: "crew-messaging:policy",
				order: 65,
				text: () => "Use crew_message to send a durable text message to a configured fabric address. Replies must preserve the supplied message id."
			}));
			disposers.push(agent.ctx.tools.register(defineTool({
				name: "crew_addresses",
				description: "List the fabric addresses bound to this exact session.",
				parameters: {},
				output: {
					schema: addressOutput,
					render: (_args, value) => output(value)
				},
				async execute(_args, exec) {
					return { addresses: service.addresses(String(caller(exec.agent, "crew_addresses").id)) };
				}
			})));
			disposers.push(agent.ctx.tools.register(defineTool({
				name: "crew_message",
				description: "Send a durable text message from this session to a configured fabric address.",
				parameters: {
					recipient: {
						type: "string",
						required: true
					},
					text: {
						type: "string",
						required: true
					},
					reply_to_message_id: { type: "string" }
				},
				output: {
					schema: sendOutput,
					render: (_args, value) => output(value)
				},
				async execute(args, exec) {
					const agent = caller(exec.agent, "crew_message");
					const sent = await service.send(String(agent.id), String(exec.callId), args.recipient, args.text, args.reply_to_message_id);
					return {
						message_id: sent.messageId,
						replayed: sent.replayed
					};
				}
			})));
		} catch (error) {
			for (const dispose of disposers.reverse()) dispose();
			throw error;
		}
		installed.set(agent, () => {
			for (const dispose of disposers.reverse()) dispose();
		});
	};
	for (const agent of ctx.agents.list()) install(agent);
	const stopCreated = ctx.on("agent/created", ({ agent }) => {
		install(agent);
	});
	const stopDisposed = ctx.on("agent/disposed", ({ agent }) => {
		installed.get(agent)?.();
		installed.delete(agent);
	});
	return () => {
		stopCreated();
		stopDisposed();
		for (const dispose of installed.values()) dispose();
		installed.clear();
	};
}
//#endregion
//#region src/index.ts
/** DSH provider entry point for the local crew messaging fabric. */
/** Cordis provider plus consumer: it owns only its adapter lease and created cold-root handles. */
var CrewMessagingProvider = class extends Service {
	static inject = ["agents", "sessions"];
	runtime;
	service;
	constructor(ctx, config = {}) {
		super(ctx, "crewMessaging");
		this.runtime = new DshRuntime(ctx);
		this.service = new CrewMessagingService(new FabricClient(config.url ?? "http://127.0.0.1:8787"), this.runtime, config);
		const disposeTools = installScopedTools(ctx, this.service);
		ctx.effect(() => {
			this.service.start().catch((error) => ctx.logger.warn(`crew messaging start: ${String(error)}`));
			return async () => {
				disposeTools();
				await this.service.dispose();
				await this.runtime.dispose();
			};
		}, "crewMessaging.lifecycle()");
	}
};
var DshRuntime = class {
	ctx;
	handles = /* @__PURE__ */ new Map();
	resumes = /* @__PURE__ */ new Map();
	constructor(ctx) {
		this.ctx = ctx;
	}
	live(sessionId) {
		const agent = this.root(sessionId);
		return agent === void 0 ? void 0 : this.wrap(agent);
	}
	async resume(sessionId) {
		const live = this.live(sessionId);
		if (live !== void 0) return live;
		let pending = this.resumes.get(sessionId);
		if (pending === void 0) {
			pending = this.resumeExact(sessionId).finally(() => {
				this.resumes.delete(sessionId);
			});
			this.resumes.set(sessionId, pending);
		}
		const agent = await pending;
		return agent === void 0 ? void 0 : this.wrap(agent);
	}
	async inspect(sessionId) {
		const live = this.root(sessionId);
		if (live !== void 0) return acceptedMessages(live.session.events);
		const persistence = this.ctx.get("sessionPersistence");
		if (persistence === void 0) return void 0;
		try {
			return acceptedMessages((await persistence.inspect(sessionId)).events);
		} catch {
			return;
		}
	}
	async flush(agent) {
		return await this.ctx.sessions.flush(agent.agent.session);
	}
	message(delivery, envelope) {
		return createUserMessage({
			content: [{
				type: "text",
				text: envelope.body
			}],
			source: {
				kind: "crew-messaging",
				messageId: envelope.message_id,
				deliveryId: delivery.delivery_id,
				senderAddress: envelope.sender_address,
				recipientAddress: envelope.recipient_address,
				form: "relay"
			}
		});
	}
	onStatus(listener) {
		return this.ctx.on("agent/status", ({ agent }) => {
			listener(this.wrap(agent));
		});
	}
	async dispose() {
		await Promise.all([...this.handles.values()].map((handle) => handle.dispose()));
		this.handles.clear();
	}
	wrap(agent) {
		return {
			agent,
			sessionId: String(agent.id),
			get status() {
				return agent.status;
			},
			followup: (message) => {
				agent.followup(message);
			}
		};
	}
	async resumeExact(sessionId) {
		const id = sessionId;
		const existing = this.root(sessionId);
		if (existing !== void 0) return existing;
		const persistence = this.ctx.get("sessionPersistence");
		if (persistence === void 0) return void 0;
		const inspected = await persistence.inspect(id);
		if (inspected.meta.origin === "subagent") return void 0;
		const afterInspect = this.root(sessionId);
		if (afterInspect !== void 0) return afterInspect;
		const preset = resolveSessionPreset({
			header: inspected.meta,
			events: inspected.events
		});
		const presets = this.ctx.get("agentPresets");
		try {
			const handle = await this.ctx.agents.resume({
				resumeSessionId: id,
				...this.ctx.get("agentDefaultModel") === void 0 ? {} : { agentOptions: this.ctx.agentDefaultModel.currentSelection() },
				...presets === void 0 || preset === void 0 ? {} : { setup: async (agentCtx) => {
					await presets.mount(agentCtx, preset);
				} }
			});
			if (!this.ctx.agents.roots().includes(handle.agent)) {
				await handle.dispose();
				throw new Error(`session ${sessionId} resumed as a non-root`);
			}
			this.handles.set(sessionId, handle);
			return handle.agent;
		} catch (error) {
			const winner = this.root(sessionId);
			if (winner !== void 0) return winner;
			throw error;
		}
	}
	/** A bound root never adopts a same-id live subagent. */
	root(sessionId) {
		return this.ctx.agents.roots().find((agent) => agent.id === sessionId);
	}
};
/** Fold durable inbox splices in their independent next-turn and next-step coordinate spaces. */
function acceptedMessages(events) {
	const messages = [];
	const pending = {
		"next-turn": [],
		"next-step": []
	};
	for (const event of events) {
		if (event.type === "user/message") messages.push(event.data);
		if (event.type === "agent/inbox/spliced") pending[event.data.target].splice(event.data.start, event.data.removedCount ?? 0, ...event.data.inserted);
	}
	return [
		...messages,
		...pending["next-turn"],
		...pending["next-step"]
	];
}
function apply(ctx, config = {}) {
	ctx.plugin(CrewMessagingProvider, config);
}
//#endregion
export { CrewMessagingProvider, acceptedMessages, apply, apply as default };
