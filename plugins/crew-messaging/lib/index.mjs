import { Service } from "@deepseek-ai/cordis";
import { foldSessionTitle } from "@deepseek-ai/dsh-session-title";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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
	unbind(address, body) {
		return this.call(`/v1/addresses/${encodeURIComponent(address)}/binding`, "DELETE", body);
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
/** A workbench receipt is durable in the fabric ledger, never a DSH runtime insertion. */
function workbenchAttempt(deliveryId) {
	return `dsh-crew:${deliveryId}:workbench`;
}
//#endregion
//#region src/addressing.ts
/**
* Merge explicit configuration with user-title discovery.
*
* Configured rows win both their session and their case-insensitive address.
* A title shared case-insensitively by two roots is omitted entirely rather
* than selecting whichever catalog row happened to arrive first.
*/
function effectiveBindings(configured, discovered) {
	const configuredAddresses = new Set(configured.map((binding) => addressKey(binding.address)));
	const configuredSessions = new Set(configured.map((binding) => binding.sessionId));
	const grouped = /* @__PURE__ */ new Map();
	for (const binding of discovered) {
		if (configuredAddresses.has(addressKey(binding.address)) || configuredSessions.has(binding.sessionId)) continue;
		const key = addressKey(binding.address);
		const values = grouped.get(key) ?? [];
		values.push(binding);
		grouped.set(key, values);
	}
	const dynamic = [];
	const directory = configured.map((binding) => ({
		address: binding.address,
		status: "routable",
		source: "configured"
	}));
	for (const values of grouped.values()) {
		if (values.length !== 1) {
			const address = values.map((binding) => binding.address).sort()[0];
			if (address !== void 0) directory.push({
				address,
				status: "ambiguous",
				source: "session-title"
			});
			continue;
		}
		const [binding] = values;
		if (binding !== void 0) {
			dynamic.push(binding);
			directory.push({
				address: binding.address,
				status: "routable",
				source: "session-title"
			});
		}
	}
	return {
		all: [...configured, ...dynamic],
		dynamic,
		directory
	};
}
/** Case-insensitive identity used only to reject ambiguous human aliases. */
function addressKey(address) {
	return address.toLowerCase();
}
//#endregion
//#region src/service.ts
const defaults$1 = {
	adapterId: "dsh-crew-messaging",
	instanceId: "dsh-crew-messaging-local",
	workbenchAddress: "dsh/workbench",
	codexControlUrl: "http://127.0.0.1:8788",
	reviewUrl: "http://127.0.0.1:8413",
	leaseDuration: "2m",
	renewMs: 45e3,
	pollMs: 1e3,
	claimDuration: "45s",
	ttl: "24h",
	acceptanceTimeoutMs: 1e3,
	acceptancePollMs: 10
};
const workbenchTarget = "dsh-crew-workbench";
/** `deliver_when_idle` makes the workbench visible to Codex's dynamic crew directory. */
const workbenchCapabilities = ["deliver_when_idle", "workbench-inbox"];
const CREW_WORKBENCH_PROMPT_TOO_LARGE = "crew messaging: prompt must be 16 KiB or smaller";
/** A leased FIFO pump that only delivers an immutable fabric envelope once DSH accepted it. */
var CrewMessagingService = class {
	fabric;
	runtime;
	discovery;
	config;
	configuredBindings;
	effective;
	directoryEntries = [];
	directoryListeners = /* @__PURE__ */ new Set();
	managedDynamic = /* @__PURE__ */ new Map();
	tails = /* @__PURE__ */ new Map();
	lease;
	leaseRenewedAt = 0;
	initialized = false;
	stopped = false;
	timer;
	inFlight = /* @__PURE__ */ new Set();
	disposeStatus;
	disposeDiscovery;
	addressingTail = Promise.resolve();
	constructor(fabric, runtime, config = {}, discovery) {
		this.fabric = fabric;
		this.runtime = runtime;
		this.discovery = discovery;
		this.config = {
			...defaults$1,
			url: config.url ?? "http://127.0.0.1:8787",
			bindings: config.bindings ?? [],
			reviewerProfilePath: config.reviewerProfilePath ?? "",
			reviewerPreset: config.reviewerPreset ?? "",
			reviewerProvider: config.reviewerProvider ?? "",
			reviewerModel: config.reviewerModel ?? "",
			reviewerEffort: config.reviewerEffort ?? "",
			reviewerCapacity: config.reviewerCapacity ?? 0,
			...config
		};
		validateBindings(this.config.bindings);
		if (this.config.workbenchAddress.trim() === "") throw new Error("crew messaging: workbenchAddress is required");
		if (this.config.bindings.some((binding) => addressKey(binding.address) === addressKey(this.config.workbenchAddress))) throw new Error(`crew messaging: workbenchAddress "${this.config.workbenchAddress}" cannot also bind a DSH session`);
		this.configuredBindings = this.config.bindings;
		this.effective = [];
		this.disposeStatus = runtime.onStatus((agent) => {
			if (agent.status === "idle") this.observe(this.pumpAfterAddressing(agent.sessionId));
		});
	}
	async start() {
		this.disposeDiscovery = this.discovery?.onChanged(() => this.observe(this.enqueueAddressing()));
		try {
			await this.initialize();
		} finally {
			this.schedule();
		}
	}
	async dispose() {
		this.stopped = true;
		if (this.timer !== void 0) clearTimeout(this.timer);
		this.disposeDiscovery?.();
		this.disposeStatus();
		while (this.inFlight.size > 0) await Promise.all([...this.inFlight]);
		this.directoryListeners.clear();
	}
	addresses(sessionId) {
		return this.effective.filter((binding) => binding.sessionId === sessionId).map((binding) => binding.address);
	}
	directory() {
		return this.directoryEntries;
	}
	status() {
		return {
			initialized: this.initialized,
			stopped: this.stopped,
			connected: !this.stopped && this.lease !== void 0,
			...this.lease?.expires_at === void 0 || this.lease.expires_at.length === 0 ? {} : { leaseExpiresAt: this.lease.expires_at }
		};
	}
	onDirectoryChanged(listener) {
		this.directoryListeners.add(listener);
		return () => {
			this.directoryListeners.delete(listener);
		};
	}
	async send(sessionId, callId, recipientAddress, text, replyToMessageId) {
		const senderAddress = this.addresses(sessionId)[0];
		if (senderAddress === void 0) throw new Error("crew messaging: calling session is not bound");
		const recipient = this.directoryEntries.find((entry) => entry.address === recipientAddress) ?? this.directoryEntries.find((entry) => addressKey(entry.address) === addressKey(recipientAddress));
		if (recipient === void 0) throw new Error(`crew messaging: unknown recipient "${recipientAddress}"`);
		if (recipient.status !== "routable") throw new Error(`crew messaging: recipient "${recipient.address}" is ${recipient.status}`);
		const lease = await this.ensureLease();
		const result = await this.fabric.submit({
			producer_id: this.config.adapterId,
			lease_token: lease.lease_token,
			operation_id: `${sessionId}:${callId}`,
			sender_address: senderAddress,
			recipient_address: recipient.address,
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
	/** Submit one human workbench prompt to a public adapter session without exposing the lease to the browser. */
	async sendWorkbench(sessionId, operationId, text) {
		if (sessionId.trim() === "") throw new Error("crew messaging: target session is required");
		if (operationId.trim() === "") throw new Error("crew messaging: operation is required");
		if (text.trim() === "") throw new Error("crew messaging: prompt is required");
		if (Buffer.byteLength(text, "utf8") > 16384) throw new Error(CREW_WORKBENCH_PROMPT_TOO_LARGE);
		const lease = await this.ensureLease();
		const bindings = await this.fabric.listBindings();
		await this.ensureWorkbenchBinding(lease, bindings.addresses);
		const recipients = bindings.addresses.filter((binding) => binding.bound && binding.target_ref === sessionId && binding.capabilities.includes("queued-prompt-delivery"));
		if (recipients.length !== 1) throw new Error("crew messaging: target session cannot accept workbench prompts");
		const recipient = recipients[0];
		const result = await this.fabric.submit({
			producer_id: this.config.adapterId,
			lease_token: lease.lease_token,
			operation_id: `workbench:${operationId}`,
			sender_address: this.config.workbenchAddress,
			recipient_address: recipient.address,
			body: text,
			activation_policy: "wake_when_idle",
			ttl: this.config.ttl
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
			const lease = await this.ensureLease();
			await this.ensureWorkbenchBinding(lease, (await this.fabric.listBindings()).addresses);
			await this.enqueueAddressing();
			await this.reconcileWorkbench();
			await Promise.all(this.effective.map((binding) => this.pumpSession(binding.sessionId)));
			await this.pumpWorkbench();
		} finally {
			this.schedule();
		}
	}
	async initialize() {
		const lease = await this.ensureLease();
		await this.ensureWorkbenchBinding(lease, (await this.fabric.listBindings()).addresses);
		await this.enqueueAddressing();
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
	pumpAfterAddressing(sessionId) {
		return this.addressingTail.catch(() => {}).then(() => this.pumpSession(sessionId));
	}
	enqueueAddressing() {
		const tail = this.addressingTail.catch(() => {}).then(() => this.refreshAddressing());
		this.addressingTail = tail;
		return tail;
	}
	async refreshAddressing() {
		if (this.stopped) return;
		const discovered = this.discovery === void 0 ? [] : (await this.discovery.discover()).filter((binding) => addressKey(binding.address) !== addressKey(this.config.workbenchAddress));
		const desired = effectiveBindings(this.configuredBindings, discovered);
		await this.bind(desired);
	}
	async ensureWorkbenchBinding(lease, bindings) {
		const current = bindings.find((binding) => binding.address === this.config.workbenchAddress);
		if (current?.bound && current.adapter_id === this.config.adapterId && current.target_ref === workbenchTarget && current.capabilities.length === workbenchCapabilities.length && workbenchCapabilities.every((capability) => current.capabilities.includes(capability))) return;
		if (current?.bound && current.adapter_id !== this.config.adapterId) throw new Error(`crew messaging: workbench address "${this.config.workbenchAddress}" is owned by another adapter`);
		await this.fabric.putBinding(this.config.workbenchAddress, {
			actor_adapter_id: this.config.adapterId,
			lease_token: lease.lease_token,
			adapter_id: this.config.adapterId,
			target_ref: workbenchTarget,
			capabilities: workbenchCapabilities,
			...current === void 0 ? {} : { expected_revision: current.revision }
		});
	}
	async bind(plan) {
		const { all: wanted, dynamic } = plan;
		const lease = await this.ensureLease();
		const existing = await this.fabric.listBindings();
		const currentByAddress = new Map(existing.addresses.map((binding) => [binding.address, binding]));
		const nextManaged = /* @__PURE__ */ new Map();
		const dynamicByAddress = new Map(dynamic.map((binding) => [binding.address, binding]));
		const conflicts = /* @__PURE__ */ new Set();
		const active = [];
		for (const binding of wanted) {
			const current = currentByAddress.get(binding.address);
			const isDynamic = dynamicByAddress.has(binding.address);
			if (isDynamic && current?.bound && current.adapter_id !== this.config.adapterId) {
				conflicts.add(binding.address);
				continue;
			}
			if (current?.bound && current.adapter_id === this.config.adapterId && current.target_ref === binding.sessionId && sameCapabilities(current)) {
				active.push(binding);
				if (isDynamic) nextManaged.set(binding.address, {
					...binding,
					revision: current.revision
				});
				continue;
			}
			let written;
			try {
				written = await this.fabric.putBinding(binding.address, {
					actor_adapter_id: this.config.adapterId,
					lease_token: lease.lease_token,
					adapter_id: this.config.adapterId,
					target_ref: binding.sessionId,
					capabilities,
					...current === void 0 ? {} : { expected_revision: current.revision }
				});
			} catch (error) {
				if (isDynamic && error instanceof FabricError && error.code === "adapter_mismatch") {
					conflicts.add(binding.address);
					continue;
				}
				throw error;
			}
			currentByAddress.set(binding.address, written);
			active.push(binding);
			if (isDynamic) nextManaged.set(binding.address, {
				...binding,
				revision: written.revision
			});
		}
		for (const [address, prior] of this.managedDynamic) {
			if (nextManaged.has(address)) continue;
			const current = currentByAddress.get(address);
			if (current === void 0 || !current.bound || current.adapter_id !== this.config.adapterId || current.target_ref !== prior.sessionId || current.revision !== prior.revision) continue;
			await this.fabric.unbind(address, {
				actor_adapter_id: this.config.adapterId,
				lease_token: lease.lease_token,
				expected_revision: current.revision
			});
		}
		this.effective = active;
		this.managedDynamic = nextManaged;
		this.publishDirectory(plan.directory.map((entry) => conflicts.has(entry.address) ? {
			...entry,
			status: "conflict"
		} : entry));
	}
	publishDirectory(entries) {
		if (sameDirectory(this.directoryEntries, entries)) return;
		this.directoryEntries = entries;
		for (const listener of this.directoryListeners) listener();
	}
	pumpSession(sessionId) {
		const tail = (this.tails.get(sessionId) ?? Promise.resolve()).catch(() => {}).then(() => this.pumpOnce(sessionId));
		this.tails.set(sessionId, tail);
		return tail.finally(() => {
			if (this.tails.get(sessionId) === tail) this.tails.delete(sessionId);
		});
	}
	async pumpOnce(sessionId) {
		const binding = this.effective.find((candidate) => candidate.sessionId === sessionId);
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
	/** Accept one reply into the immutable workbench mailbox without touching a DSH session. */
	async pumpWorkbench() {
		if (this.stopped) return;
		const lease = await this.ensureLease();
		const claimed = await this.fabric.claim({
			adapter_id: this.config.adapterId,
			lease_token: lease.lease_token,
			operation_id: operation(`${this.config.workbenchAddress}:${Date.now()}`, "workbench-claim"),
			recipient_address: this.config.workbenchAddress,
			recipient_generation: await this.generation(this.config.workbenchAddress),
			availability: "idle",
			claim_duration: this.config.claimDuration
		});
		if (!claimed.claimed || claimed.delivery === void 0 || claimed.claim_token === void 0) return;
		const attempt = workbenchAttempt(claimed.delivery.delivery_id);
		await this.fabric.begin(claimed.delivery.delivery_id, {
			adapter_id: this.config.adapterId,
			lease_token: lease.lease_token,
			operation_id: operation(claimed.delivery.delivery_id, "workbench-begin"),
			claim_token: claimed.claim_token,
			native_attempt_ref: attempt
		});
		await this.fabric.acknowledge(claimed.delivery.delivery_id, {
			adapter_id: this.config.adapterId,
			lease_token: lease.lease_token,
			operation_id: operation(claimed.delivery.delivery_id, "workbench-ack"),
			native_attempt_ref: attempt
		});
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
		await this.reconcileWorkbench(values.deliveries);
		for (const delivery of values.deliveries.filter((item) => item.state === "dispatching" && item.claim_owner_adapter_id === this.config.adapterId && item.native_attempt_ref === nativeAttempt(item.delivery_id))) {
			const binding = this.effective.find((item) => item.address === delivery.recipient_address);
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
	/** A failed acknowledgement is retried on ordinary polls; the fabric ledger is already durable. */
	async reconcileWorkbench(known) {
		const deliveries = known ?? (await this.fabric.deliveries()).deliveries;
		for (const delivery of deliveries.filter((item) => item.state === "dispatching" && item.claim_owner_adapter_id === this.config.adapterId && item.recipient_address === this.config.workbenchAddress && item.native_attempt_ref === workbenchAttempt(item.delivery_id))) {
			const lease = await this.ensureLease();
			await this.fabric.acknowledge(delivery.delivery_id, {
				adapter_id: this.config.adapterId,
				lease_token: lease.lease_token,
				operation_id: operation(delivery.delivery_id, "workbench-ack"),
				native_attempt_ref: workbenchAttempt(delivery.delivery_id)
			});
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
function sameDirectory(left, right) {
	return left.length === right.length && left.every((entry, index) => entry.address === right[index]?.address && entry.status === right[index]?.status && entry.source === right[index]?.source);
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
//#region src/framing.ts
/**
* Render one fabric envelope as model-visible text without exposing adapter
* targets or DSH session ids. The body is a standalone JSON string, so its
* contents cannot become a second metadata record or delimiter.
*/
function frameCrewDelivery(message) {
	const header = message.reply_to_message_id === void 0 ? {
		type: "crew_delivery",
		message_id: message.message_id,
		from: message.sender_address,
		to: message.recipient_address,
		kind: "ordinary"
	} : {
		type: "crew_delivery",
		message_id: message.message_id,
		from: message.sender_address,
		to: message.recipient_address,
		kind: "reply",
		reply_to_message_id: message.reply_to_message_id
	};
	const instruction = message.reply_to_message_id === void 0 ? `If a response is warranted, send a linked reply using crew_message(recipient=${JSON.stringify(message.sender_address)}, reply_to_message_id=${JSON.stringify(message.message_id)}, text="...").` : `This is a reply acknowledging prior message ${JSON.stringify(message.reply_to_message_id)}. Do not reply merely because this message is a reply. Only if its body independently requires further work, send a new ordinary crew_message without reply_to_message_id.`;
	return `${JSON.stringify(header)}\n${instruction}\n<crew-message-body encoding="json">\n${JSON.stringify(message.body)}\n</crew-message-body>`;
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
const directoryOutput = {
	type: "object",
	additionalProperties: false,
	properties: { entries: {
		type: "array",
		required: true,
		items: {
			type: "object",
			additionalProperties: false,
			properties: {
				address: {
					type: "string",
					required: true
				},
				status: {
					type: "string",
					required: true,
					enum: [
						"routable",
						"ambiguous",
						"conflict"
					]
				},
				source: {
					type: "string",
					required: true,
					enum: ["configured", "session-title"]
				}
			}
		}
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
/** Reconcile installed session-scoped effects against the current effective roots. */
function synchronizeScopedTools(roots, installed, hasAddress, install) {
	for (const root of roots) if (hasAddress(root)) install(root);
	else {
		installed.get(root)?.();
		installed.delete(root);
	}
	for (const [agent, dispose] of installed) if (!roots.includes(agent)) {
		dispose();
		installed.delete(agent);
	}
}
/** Install tools only for roots with a currently effective fabric address. */
function installScopedTools(ctx, service) {
	const installed = /* @__PURE__ */ new Map();
	const remove = (agent) => {
		installed.get(agent)?.();
		installed.delete(agent);
	};
	const install = (agent) => {
		if (installed.has(agent) || !ctx.agents.roots().includes(agent) || service.addresses(String(agent.id)).length === 0) return;
		const disposers = [];
		try {
			disposers.push(agent.ctx.systemPrompt.section({
				name: "crew-messaging:policy",
				order: 65,
				text: () => "Use crew_message to send a durable text message to a configured fabric address. An ordinary delivered crew message explains how to send a linked reply when one is warranted. A delivered reply acknowledges prior work and must not be answered merely because it is a reply."
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
				name: "crew_directory",
				description: "List human fabric aliases and whether each is routable, ambiguous, or occupied by another adapter.",
				parameters: {},
				output: {
					schema: directoryOutput,
					render: (_args, value) => output(value)
				},
				async execute(_args, exec) {
					caller(exec.agent, "crew_directory");
					return { entries: [...service.directory()] };
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
	const sync = (agent) => {
		if (ctx.agents.roots().includes(agent) && service.addresses(String(agent.id)).length > 0) install(agent);
		else remove(agent);
	};
	const syncAll = () => {
		synchronizeScopedTools(ctx.agents.roots(), installed, (agent) => service.addresses(String(agent.id)).length > 0, install);
	};
	syncAll();
	const stopDirectory = service.onDirectoryChanged(syncAll);
	const stopCreated = ctx.on("agent/created", ({ agent }) => {
		sync(agent);
	});
	const stopDisposed = ctx.on("agent/disposed", ({ agent }) => {
		remove(agent);
	});
	return () => {
		stopDirectory();
		stopCreated();
		stopDisposed();
		for (const dispose of installed.values()) dispose();
		installed.clear();
	};
}
//#endregion
//#region src/dashboard/host.ts
/** Same-origin endpoint served by the DSH plugin. */
const CREW_DASHBOARD_PATH = "/plugins/dsh-crew-messaging/dashboard";
const defaults = {
	leaseDuration: "2m",
	renewMs: 45e3,
	pollMs: 1e3,
	claimDuration: "45s",
	ttl: "24h",
	acceptanceTimeoutMs: 1e3,
	acceptancePollMs: 10
};
/** Resolve the tunable values shown by the read-only cockpit. */
function dashboardTuning(config) {
	return {
		leaseDuration: config.leaseDuration ?? defaults.leaseDuration,
		renewMs: config.renewMs ?? defaults.renewMs,
		pollMs: config.pollMs ?? defaults.pollMs,
		claimDuration: config.claimDuration ?? defaults.claimDuration,
		ttl: config.ttl ?? defaults.ttl,
		acceptanceTimeoutMs: config.acceptanceTimeoutMs ?? defaults.acceptanceTimeoutMs,
		acceptancePollMs: config.acceptancePollMs ?? defaults.acceptancePollMs
	};
}
/** Build the safe snapshot from one adapter and its trusted-loopback fabric. */
async function crewDashboardSnapshot(input) {
	const request = input.request ?? fetch;
	const [ready, traffic] = await Promise.all([readJson$1(request, new URL("/readyz", input.fabricUrl)), readJson$1(request, new URL("/v1/traffic", input.fabricUrl))]);
	return {
		fabric: projectReadiness(ready),
		adapter: input.adapter.status(),
		directory: input.adapter.directory().map(projectDirectory),
		tuning: input.tuning,
		messages: projectMessages(traffic),
		deliveries: projectDeliveries(traffic)
	};
}
/** Own one response lifecycle for the same-origin, read-only endpoint. */
function crewDashboardHandler(input) {
	return async (request, response) => {
		if (request.method !== "GET") {
			response.writeHead(405, { allow: "GET" });
			response.end();
			return;
		}
		try {
			const snapshot = await crewDashboardSnapshot(input);
			response.writeHead(200, {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store"
			});
			response.end(JSON.stringify(snapshot));
		} catch {
			response.writeHead(503, {
				"content-type": "application/json; charset=utf-8",
				"cache-control": "no-store"
			});
			response.end(JSON.stringify({ error: "Crew messaging fabric is unavailable" }));
		}
	};
}
async function readJson$1(request, url) {
	const response = await request(url, {
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(1500)
	});
	if (!response.ok) throw new Error(`fabric response ${String(response.status)}`);
	return await response.json();
}
function projectReadiness(value) {
	return {
		ready: true,
		status: text$2(object$2(value)?.status) ?? "ok"
	};
}
function projectDirectory(value) {
	return {
		address: value.address,
		status: value.status,
		source: value.source
	};
}
function projectMessages(value) {
	return array$1(object$2(value)?.messages).slice(-20).reverse().flatMap((entry) => {
		const id = text$2(entry.message_id);
		const from = text$2(entry.sender_address);
		const to = text$2(entry.recipient_address);
		const createdAt = text$2(entry.created_at);
		if (id === void 0 || from === void 0 || to === void 0 || createdAt === void 0) return [];
		return [{
			id,
			from,
			to,
			createdAt,
			preview: preview(text$2(entry.body) ?? ""),
			...optional$1("replyTo", text$2(entry.reply_to_message_id))
		}];
	});
}
function projectDeliveries(value) {
	return array$1(object$2(value)?.deliveries).slice(-20).reverse().flatMap((entry) => {
		const id = text$2(entry.delivery_id);
		const messageId = text$2(entry.message_id);
		const recipient = text$2(entry.recipient_address);
		const state = text$2(entry.state);
		if (id === void 0 || messageId === void 0 || recipient === void 0 || state === void 0) return [];
		const updatedAt = text$2(entry.terminal_at) ?? text$2(entry.dispatching_at) ?? text$2(entry.claimed_at) ?? text$2(entry.created_at);
		return [{
			id,
			messageId,
			recipient,
			state,
			...optional$1("action", text$2(entry.dispatch_action)),
			...optional$1("updatedAt", updatedAt)
		}];
	});
}
function object$2(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function array$1(value) {
	return Array.isArray(value) ? value.filter((entry) => object$2(entry) !== void 0) : [];
}
function text$2(value) {
	return typeof value === "string" ? value : void 0;
}
function optional$1(key, value) {
	return value === void 0 ? {} : { [key]: value };
}
function preview(value) {
	return value.length <= 160 ? value : `${value.slice(0, 157)}...`;
}
//#endregion
//#region src/dashboard/review.ts
/** Same-origin endpoint served by the DSH plugin for review observations. */
const CREW_REVIEW_DASHBOARD_PATH = "/plugins/dsh-crew-messaging/review-pool";
/** Same-origin endpoint used only to release one idle retained reviewer. */
const CREW_REVIEW_AFFINITY_PATH = "/plugins/dsh-crew-messaging/review-affinity";
/** Same-origin endpoint used only to retry one exact failed review job. */
const CREW_REVIEW_RETRY_PATH = "/plugins/dsh-crew-messaging/review-retry";
/** Build the browser-safe pool projection from the review service's two reads. */
async function crewReviewDashboardSnapshot(input) {
	const request = input.request ?? fetch;
	const [health, pool] = await Promise.all([readJson(request, new URL("/healthz", input.reviewUrl)), readJson(request, new URL(`/v1/review-pool?limit=${String(20)}`, input.reviewUrl))]);
	const healthProjection = projectHealth(health);
	const poolProjection = projectPool(pool);
	return {
		health: healthProjection,
		backend: poolProjection.backend,
		capacity: poolProjection.capacity,
		queued: poolProjection.queued,
		running: poolProjection.running,
		finalizing: poolProjection.finalizing,
		active: poolProjection.active,
		recent: poolProjection.recent,
		affinities: poolProjection.affinities,
		failures: unresolvedFailures([...poolProjection.active, ...poolProjection.recent])
	};
}
function unresolvedFailures(jobs) {
	const newest = /* @__PURE__ */ new Map();
	for (const job of jobs) {
		const key = `${job.projectId}\u0000${String(job.taskId)}`;
		const current = newest.get(key);
		if (current === void 0 || job.reviewRoundId > current.reviewRoundId) newest.set(key, job);
	}
	return [...newest.values()].filter((job) => job.state === "failed" && job.failure !== void 0);
}
/** Serve the review projection without forwarding service-private fields. */
function crewReviewDashboardHandler(input) {
	return async (request, response) => {
		if (request.method !== "GET") {
			response.writeHead(405, { allow: "GET" });
			response.end();
			return;
		}
		try {
			write$1(response, 200, await crewReviewDashboardSnapshot(input));
		} catch {
			write$1(response, 503, { error: "Crew review service is unavailable" });
		}
	};
}
/** Release an idle logical task affinity through the plugin-owned route. */
function crewReviewAffinityHandler(input) {
	return async (request, response) => {
		if (request.method !== "DELETE") {
			response.writeHead(405, { allow: "DELETE" });
			response.end();
			return;
		}
		const query = new URL(request.url ?? "/", "http://localhost").searchParams;
		const projectId = query.get("project")?.trim();
		const taskText = query.get("task")?.trim();
		if (projectId === void 0 || projectId === "" || taskText === void 0 || taskText === "") {
			write$1(response, 400, { error: "project and task are required" });
			return;
		}
		if (!/^\d+$/.test(taskText) || Number(taskText) <= 0 || !Number.isSafeInteger(Number(taskText))) {
			write$1(response, 400, { error: "task must be a positive integer" });
			return;
		}
		const requestFn = input.request ?? fetch;
		try {
			const upstream = await requestFn(new URL(`/v1/review-affinities/${encodeURIComponent(projectId)}/${encodeURIComponent(taskText)}`, input.reviewUrl), {
				method: "DELETE",
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(5e3)
			});
			if (!upstream.ok) {
				write$1(response, upstream.status === 404 || upstream.status === 409 ? upstream.status : 503, { error: await upstreamError(upstream) });
				return;
			}
			write$1(response, 200, { released: true });
		} catch {
			write$1(response, 503, { error: "Crew review service is unavailable" });
		}
	};
}
/** Retry one exact failed review job through the plugin-owned route. */
function crewReviewRetryHandler(input) {
	return async (request, response) => {
		if (request.method !== "POST") {
			response.writeHead(405, { allow: "POST" });
			response.end();
			return;
		}
		const values = new URL(request.url ?? "/", "http://localhost").searchParams.getAll("job_id");
		const jobId = values.length === 1 ? values[0]?.trim() : void 0;
		if (jobId === void 0 || !safeJobId(jobId)) {
			write$1(response, 400, { error: "job_id must be a safe identifier" });
			return;
		}
		const requestFn = input.request ?? fetch;
		try {
			const upstream = await requestFn(new URL(`/v1/review-jobs/${encodeURIComponent(jobId)}/retry`, input.reviewUrl), {
				method: "POST",
				headers: { accept: "application/json" },
				signal: AbortSignal.timeout(5e3)
			});
			if (!upstream.ok) {
				write$1(response, upstream.status === 404 || upstream.status === 409 ? upstream.status : 503, { error: await upstreamError(upstream) });
				return;
			}
			const value = object$1(await upstream.json());
			const job = object$1(value?.job);
			const result = (job === void 0 ? [] : projectJob(job))[0];
			if (value?.retried !== true || result === void 0 || result.id !== jobId) {
				write$1(response, 503, { error: "Crew review service returned an invalid retry response" });
				return;
			}
			write$1(response, 200, {
				job: result,
				retried: true
			});
		} catch {
			write$1(response, 503, { error: "Crew review service is unavailable" });
		}
	};
}
async function readJson(request, url) {
	const response = await request(url, {
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(5e3)
	});
	if (!response.ok) throw new Error(`review service response ${String(response.status)}`);
	return await response.json();
}
function projectHealth(value) {
	const status = text$1(object$1(value)?.status);
	if (status === void 0) throw new Error("invalid review health response");
	return {
		ready: true,
		status
	};
}
function projectPool(value) {
	const record = object$1(value);
	const backend = text$1(record?.backend);
	const capacity = nonNegativeInteger(record?.capacity);
	const queued = nonNegativeInteger(record?.queued);
	const running = nonNegativeInteger(record?.running);
	if (backend === void 0 || capacity === void 0 || queued === void 0 || running === void 0) throw new Error("invalid review pool response");
	return {
		backend,
		capacity,
		queued,
		running,
		finalizing: nonNegativeInteger(record?.finalizing) ?? 0,
		active: boundedArray(record?.active, 20).flatMap(projectJob),
		recent: boundedArray(record?.recent, 20).flatMap(projectJob),
		affinities: array(record?.retained_affinities).flatMap(projectAffinity)
	};
}
function projectJob(value) {
	const key = object$1(value.key);
	const id = text$1(value.id);
	const projectId = text$1(key?.project_id);
	const taskId = positiveInteger(key?.task_id);
	const reviewRoundId = positiveInteger(key?.review_round_id);
	const state = text$1(value.state);
	const createdAt = text$1(value.created_at);
	const updatedAt = text$1(value.updated_at);
	if (id === void 0 || projectId === void 0 || taskId === void 0 || reviewRoundId === void 0 || state === void 0 || createdAt === void 0 || updatedAt === void 0) return [];
	const verdict = text$1(object$1(value.receipt)?.verdict);
	const failure = text$1(value.failure);
	return [{
		id,
		projectId,
		taskId,
		reviewRoundId,
		state,
		...verdict === void 0 ? {} : { verdict },
		...failure === void 0 || failure === "" ? {} : { failure },
		createdAt,
		updatedAt
	}];
}
function projectAffinity(value) {
	const projectId = text$1(value.project_id);
	const taskId = positiveInteger(value.task_id);
	const expiresAt = text$1(value.expires_at);
	return projectId === void 0 || taskId === void 0 || expiresAt === void 0 ? [] : [{
		projectId,
		taskId,
		expiresAt
	}];
}
function boundedArray(value, limit) {
	return array(value).slice(0, limit);
}
function array(value) {
	return Array.isArray(value) ? value.filter((entry) => object$1(entry) !== void 0) : [];
}
function object$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function text$1(value) {
	return typeof value === "string" ? value : void 0;
}
function nonNegativeInteger(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
function positiveInteger(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : void 0;
}
function safeJobId(value) {
	return /^[A-Za-z0-9_-]+$/.test(value);
}
async function upstreamError(response) {
	try {
		const error = text$1(object$1(await response.json())?.error);
		if (error !== void 0 && error !== "") return error;
	} catch {}
	return `Crew review request failed (${String(response.status)})`;
}
function write$1(response, status, value) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(value));
}
//#endregion
//#region src/dashboard/foreign-sessions.ts
/** Same-origin read-only projections and stream proxy for foreign Crew sessions. */
/** Same-origin browser endpoints; the browser never reaches the loopback fabric directly. */
const CREW_SESSIONS_PATH = "/plugins/dsh-crew-messaging/sessions";
const CREW_SESSION_EVENTS_PATH = "/plugins/dsh-crew-messaging/session-events";
const CREW_SESSION_EVENTS_STREAM_PATH = "/plugins/dsh-crew-messaging/session-events/stream";
const CREW_SESSION_PROMPT_PATH = "/plugins/dsh-crew-messaging/session-prompt";
const CREW_WORKBENCH_INBOX_PATH = "/plugins/dsh-crew-messaging/workbench-inbox";
const CREW_SESSION_PROMPT_REQUEST_MAX_BYTES = 20 * 1024;
const CREW_SESSION_PROMPT_TOO_LARGE = "Crew prompt request must be 20 KiB or smaller";
/** Build explicit browser fields from the service's public session response. */
async function crewForeignSessionsSnapshot(input) {
	const value = object(await (await requestJson(input, "/v1/sessions", { limit: boundedLimit(input.limit, 100) })).json());
	const sessions = Array.isArray(value?.sessions) ? value.sessions.map(projectSession) : void 0;
	if (sessions === void 0 || sessions.some((session) => session === void 0)) throw new Error("invalid session response");
	return { sessions };
}
/** Build an explicit bounded timeline response for one public foreign session identity. */
async function crewForeignSessionEventsSnapshot(input) {
	if (input.sessionId.trim() === "") throw new Error("session_id is required");
	const value = object(await (await requestJson(input, "/v1/session-events", {
		session_id: input.sessionId,
		cursor: boundedCursor(input.cursor),
		limit: boundedLimit(input.limit, 200)
	})).json());
	const events = Array.isArray(value?.events) ? value.events.map(projectEvent) : void 0;
	if (events === void 0 || events.some((event) => event === void 0)) throw new Error("invalid session event response");
	return { events };
}
/** Join the public workbench mailbox to immutable message facts for browser display. */
async function crewWorkbenchInboxSnapshot(input) {
	const address = input.workbenchAddress?.trim() || "dsh/workbench";
	const mailbox = object(await (await requestJson(input, `/v1/mailbox/${encodeURIComponent(address)}`, {})).json());
	const deliveries = Array.isArray(mailbox?.deliveries) ? mailbox.deliveries.map(projectInboxDelivery) : void 0;
	if (deliveries === void 0 || deliveries.some((value) => value === void 0)) throw new Error("invalid workbench inbox response");
	const limit = boundedLimit(input.limit, 100);
	const recent = [...deliveries].sort((left, right) => left.acceptedSequence - right.acceptedSequence).slice(-limit);
	const messages = await Promise.all(recent.map(async (delivery) => {
		return projectInboxMessage(await (await requestJson(input, `/v1/messages/${encodeURIComponent(delivery.messageId)}`, {})).json());
	}));
	if (messages.some((message) => message === void 0)) throw new Error("invalid workbench inbox message");
	return { messages: recent.map((delivery, index) => {
		const message = messages[index];
		return {
			messageId: message.messageId,
			deliveryId: delivery.deliveryId,
			state: delivery.state,
			sender: message.sender,
			body: message.body,
			createdAt: message.createdAt,
			...message.replyToMessageId === void 0 ? {} : { replyToMessageId: message.replyToMessageId }
		};
	}).reverse() };
}
/** Own the same-origin JSON response lifecycle for a bounded foreign session list. */
function crewForeignSessionsHandler(input) {
	return async (request, response) => {
		if (request.method !== "GET") return methodNotAllowed(response);
		try {
			const limit = requestLimit(request, 100);
			respondJson(response, 200, await crewForeignSessionsSnapshot({
				fabricUrl: input.fabricUrl,
				limit,
				...input.request === void 0 ? {} : { request: input.request }
			}));
		} catch (error) {
			respondJson(response, 503, { error: error instanceof Error ? error.message : "Crew session service is unavailable" });
		}
	};
}
/** Own the same-origin JSON response lifecycle for one bounded foreign event history. */
function crewForeignSessionEventsHandler(input) {
	return async (request, response) => {
		if (request.method !== "GET") return methodNotAllowed(response);
		let sessionId;
		let cursor;
		let limit;
		try {
			sessionId = requiredQuery(request, "session_id");
			cursor = requestCursor(request);
			limit = requestLimit(request, 200);
		} catch (error) {
			respondJson(response, 400, { error: error instanceof Error ? error.message : "invalid request" });
			return;
		}
		try {
			respondJson(response, 200, await crewForeignSessionEventsSnapshot({
				fabricUrl: input.fabricUrl,
				sessionId,
				cursor,
				limit,
				...input.request === void 0 ? {} : { request: input.request }
			}));
		} catch (error) {
			respondJson(response, 503, { error: error instanceof Error ? error.message : "Crew session service is unavailable" });
		}
	};
}
/** Same-origin view of replies delivered to the DSH workbench address. */
function crewWorkbenchInboxHandler(input) {
	return async (request, response) => {
		if (request.method !== "GET") return methodNotAllowed(response);
		try {
			respondJson(response, 200, await crewWorkbenchInboxSnapshot({
				fabricUrl: input.fabricUrl,
				limit: requestLimit(request, 100),
				...input.workbenchAddress === void 0 ? {} : { workbenchAddress: input.workbenchAddress },
				...input.request === void 0 ? {} : { request: input.request }
			}));
		} catch (error) {
			respondJson(response, 503, { error: error instanceof Error ? error.message : "Crew workbench inbox is unavailable" });
		}
	};
}
/** Keep browser prompts same-origin while the provider retains its fabric lease. */
function crewForeignSessionPromptHandler(input) {
	return async (request, response) => {
		if (request.method !== "POST") return methodNotAllowed(response, "POST");
		try {
			const body = object(JSON.parse(await requestText(request, CREW_SESSION_PROMPT_REQUEST_MAX_BYTES)));
			const sessionId = text(body?.session_id);
			const operationId = text(body?.operation_id);
			const prompt = text(body?.text);
			if (sessionId === void 0 || operationId === void 0 || prompt === void 0) throw new Error("session_id, operation_id, and text are required");
			const submitted = await input.adapter.sendWorkbench(sessionId, operationId, prompt);
			respondJson(response, 200, {
				messageId: submitted.messageId,
				replayed: submitted.replayed
			});
		} catch (error) {
			respondJson(response, 400, { error: error instanceof Error ? error.message : "Crew prompt submission failed" });
		}
	};
}
/**
* Proxy the fabric SSE body without buffering it, so EventSource reconnects stay same-origin.
*
* @returns An async handler that aborts the upstream request when the browser disconnects.
*/
function crewForeignSessionEventsStreamHandler(input) {
	return async (request, response) => {
		if (request.method !== "GET") return methodNotAllowed(response);
		let sessionId;
		let cursor;
		let limit;
		try {
			sessionId = requiredQuery(request, "session_id");
			cursor = requestCursor(request);
			limit = requestLimit(request, 200);
		} catch (error) {
			respondJson(response, 400, { error: error instanceof Error ? error.message : "invalid request" });
			return;
		}
		const controller = new AbortController();
		const abort = () => {
			controller.abort();
		};
		response.once("close", abort);
		try {
			const upstream = await (input.request ?? fetch)(upstreamUrl(input.fabricUrl, "/v1/session-events/stream", {
				session_id: sessionId,
				cursor,
				limit
			}), {
				headers: {
					accept: "text/event-stream",
					...request.headers["last-event-id"] === void 0 ? {} : { "last-event-id": String(request.headers["last-event-id"]) }
				},
				signal: controller.signal
			});
			if (!upstream.ok || upstream.body === null) {
				response.writeHead(upstream.status || 503, {
					"content-type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
					"cache-control": "no-store"
				});
				response.end(upstream.body === null ? "" : await upstream.text());
				return;
			}
			response.writeHead(upstream.status, {
				"content-type": upstream.headers.get("content-type") ?? "text/event-stream",
				"cache-control": upstream.headers.get("cache-control") ?? "no-cache",
				connection: "keep-alive"
			});
			const body = Readable.fromWeb(upstream.body);
			body.on("error", () => {
				if (!response.destroyed) response.destroy();
			});
			body.pipe(response);
			await new Promise((resolve) => response.once("close", resolve));
		} catch {
			if (!response.headersSent) respondJson(response, 503, { error: "Crew session stream is unavailable" });
			else if (!response.destroyed) response.destroy();
		} finally {
			response.off("close", abort);
			controller.abort();
		}
	};
}
async function requestJson(input, path, query) {
	const response = await (input.request ?? fetch)(upstreamUrl(input.fabricUrl, path, query), {
		headers: { accept: "application/json" },
		signal: AbortSignal.timeout(1500)
	});
	if (!response.ok) throw new Error(`fabric response ${String(response.status)}`);
	return response;
}
function upstreamUrl(fabricUrl, path, query) {
	const url = new URL(path, fabricUrl);
	for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
	return url;
}
function methodNotAllowed(response, allow = "GET") {
	response.writeHead(405, { allow });
	response.end();
}
async function requestText(request, maxBytes = CREW_SESSION_PROMPT_REQUEST_MAX_BYTES) {
	const chunks = [];
	let bytes = 0;
	for await (const chunk of request) {
		const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		bytes += value.length;
		if (bytes > maxBytes) throw new Error(CREW_SESSION_PROMPT_TOO_LARGE);
		chunks.push(value);
	}
	return Buffer.concat(chunks).toString("utf8");
}
function respondJson(response, status, value) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(value));
}
function requiredQuery(request, name) {
	const value = new URL(request.url ?? "/", "http://localhost").searchParams.get(name)?.trim();
	if (value === void 0 || value === "") throw new Error(`${name} is required`);
	return value;
}
function requestLimit(request, fallback) {
	const value = new URL(request.url ?? "/", "http://localhost").searchParams.get("limit");
	if (value === null) return fallback;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error("limit must be positive");
	return Math.min(parsed, fallback);
}
function requestCursor(request) {
	const value = new URL(request.url ?? "/", "http://localhost").searchParams.get("cursor");
	if (value === null) return 0;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error("cursor must be non-negative");
	return parsed;
}
function boundedLimit(value, fallback) {
	return Number.isSafeInteger(value) && value > 0 ? Math.min(value, fallback) : fallback;
}
function boundedCursor(value) {
	return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
function projectSession(value) {
	const record = object(value);
	const sessionId = text(record?.session_id);
	const adapterId = text(record?.adapter_id);
	const label = text(record?.label);
	const status = text(record?.status);
	const revision = integer(record?.revision);
	const createdAt = text(record?.created_at);
	const updatedAt = text(record?.updated_at);
	const capabilities = Array.isArray(record?.capabilities) && record.capabilities.every((item) => typeof item === "string") ? record.capabilities : void 0;
	const location = text(record?.location);
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
function projectEvent(value) {
	const record = object(value);
	const eventId = text(record?.event_id);
	const sessionId = text(record?.session_id);
	const sequence = integer(record?.sequence);
	const cursor = integer(record?.cursor);
	const eventType = text(record?.event_type);
	const occurredAt = text(record?.occurred_at);
	const recordedAt = text(record?.recorded_at);
	if (eventId === void 0 || sessionId === void 0 || sequence === void 0 || cursor === void 0 || eventType === void 0 || occurredAt === void 0 || recordedAt === void 0 || !("payload" in (record ?? {}))) return void 0;
	const payload = safePayload(record.payload);
	if (payload === void 0) return void 0;
	return {
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
function projectInboxDelivery(value) {
	const record = object(value);
	const deliveryId = text(record?.delivery_id);
	const messageId = text(record?.message_id);
	const state = text(record?.state);
	const acceptedSequence = integer(record?.accepted_sequence);
	return deliveryId === void 0 || messageId === void 0 || state === void 0 || acceptedSequence === void 0 ? void 0 : {
		deliveryId,
		messageId,
		state,
		acceptedSequence
	};
}
function projectInboxMessage(value) {
	const record = object(value);
	const messageId = text(record?.message_id);
	const sender = text(record?.sender_address);
	const body = text(record?.body);
	const createdAt = text(record?.created_at);
	const replyToMessageId = text(record?.reply_to_message_id);
	return messageId === void 0 || sender === void 0 || body === void 0 || createdAt === void 0 ? void 0 : {
		messageId,
		sender,
		body,
		createdAt,
		...replyToMessageId === void 0 ? {} : { replyToMessageId }
	};
}
/** Preserve generic event inspection while excluding the service's private routing credentials. */
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
function object(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function text(value) {
	return typeof value === "string" ? value : void 0;
}
function integer(value) {
	return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
}
//#endregion
//#region src/dashboard/codex-controls.ts
const CREW_CODEX_CREATE_PATH = "/plugins/dsh-crew-messaging/codex/create";
const CREW_CODEX_INTERRUPT_PATH = "/plugins/dsh-crew-messaging/codex/interrupt";
const CREW_CODEX_INTERACTIONS_PATH = "/plugins/dsh-crew-messaging/codex/interactions";
const CREW_CODEX_RESPOND_PATH = "/plugins/dsh-crew-messaging/codex/respond";
const CREW_CODEX_CAPABILITIES_PATH = "/plugins/dsh-crew-messaging/codex/capabilities";
var CodexControlClient = class {
	base;
	constructor(base) {
		this.base = base;
	}
	async capabilities() {
		const response = await fetch(new URL("/v1/controls/capabilities", this.base), { signal: AbortSignal.timeout(1500) });
		if (!response.ok) throw new Error(`Codex controls failed (${response.status})`);
		return await response.json();
	}
	async create(operationId, cwd) {
		const value = await this.call("/v1/controls/threads", {
			operation_id: operationId,
			cwd
		});
		if (typeof value.session_id !== "string") throw new Error("Codex controls returned an invalid create receipt");
		return { sessionId: value.session_id };
	}
	async interrupt(operationId, sessionId, turnId) {
		await this.call("/v1/controls/interrupt", {
			operation_id: operationId,
			session_id: sessionId,
			turn_id: turnId
		});
	}
	async interactions(sessionId) {
		const response = await fetch(new URL(`/v1/controls/interactions?${new URLSearchParams({ session_id: sessionId })}`, this.base), { signal: AbortSignal.timeout(1500) });
		if (!response.ok) throw new Error(`Codex controls failed (${response.status})`);
		return await response.json();
	}
	async respond(sessionId, id, method, response) {
		await this.call("/v1/controls/interactions/respond", {
			session_id: sessionId,
			id,
			method,
			response
		});
	}
	async call(path, body) {
		const response = await fetch(new URL(path, this.base), {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(5e3)
		});
		const value = await response.json();
		if (!response.ok) throw new Error(typeof value?.error === "string" ? value.error : `Codex controls failed (${response.status})`);
		return value;
	}
};
function codexControlHandler(controls) {
	return async (request, response) => {
		try {
			const value = await read(request);
			if (request.method === "GET" && request.url === "/plugins/dsh-crew-messaging/codex/capabilities") {
				write(response, 200, await controls.capabilities());
				return;
			}
			if (request.method === "GET" && request.url?.startsWith("/plugins/dsh-crew-messaging/codex/interactions")) {
				write(response, 200, await controls.interactions(new URL(request.url, "http://localhost").searchParams.get("session_id") ?? ""));
				return;
			}
			if (request.method !== "POST") {
				response.writeHead(405, { allow: "GET, POST" });
				response.end();
				return;
			}
			if (request.url === "/plugins/dsh-crew-messaging/codex/create") {
				write(response, 200, await controls.create(required(value, "operation_id"), optional(value, "cwd")));
				return;
			}
			if (request.url === "/plugins/dsh-crew-messaging/codex/interrupt") {
				await controls.interrupt(required(value, "operation_id"), required(value, "session_id"), required(value, "turn_id"));
				write(response, 200, { ok: true });
				return;
			}
			if (request.url === "/plugins/dsh-crew-messaging/codex/respond") {
				await controls.respond(required(value, "session_id"), required(value, "id"), required(value, "method"), value.response);
				write(response, 200, { ok: true });
				return;
			}
			response.writeHead(404);
			response.end();
		} catch (error) {
			write(response, error instanceof BodyTooLarge ? 413 : 400, { error: error instanceof Error ? error.message : "Codex control failed" });
		}
	};
}
var BodyTooLarge = class extends Error {};
async function read(request) {
	if (request.method === "GET") return {};
	const chunks = [];
	let size = 0;
	for await (const chunk of request) {
		const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += value.length;
		if (size > 32 * 1024) throw new BodyTooLarge("control request is too large");
		chunks.push(value);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function required(value, key) {
	const result = value[key];
	if (typeof result !== "string" || result.trim() === "") throw new Error(`${key} is required`);
	return result;
}
function optional(value, key) {
	const result = value[key];
	return typeof result === "string" ? result : "";
}
function write(response, status, value) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(value));
}
//#endregion
//#region src/reviewer-runtime.ts
/** DSH-owned, loopback-only reviewer worker runtime for Crew Review. */
/** Private loopback route used by the local crew-review process. */
const CREW_REVIEWER_RUNTIME_PATH = "/plugins/dsh-crew-messaging/reviewer-runtime";
const completionOutput = {
	type: "object",
	additionalProperties: false,
	properties: { accepted: {
		type: "boolean",
		required: true
	} }
};
const completionParameters = {
	verdict: {
		type: "string",
		required: true,
		enum: ["looks_good", "changes_requested"]
	},
	notes: { type: "string" },
	evidence: { type: "string" },
	prior_finding_resolutions: {
		type: "array",
		items: {
			type: "object",
			additionalProperties: false,
			properties: {
				finding_id: {
					type: "integer",
					required: true
				},
				status: {
					type: "string",
					required: true,
					enum: [
						"verified_fixed",
						"not_fixed",
						"superseded",
						"split_to_follow_up"
					]
				},
				verification_note: {
					type: "string",
					required: true
				}
			}
		}
	},
	new_findings: {
		type: "array",
		items: {
			type: "object",
			additionalProperties: false,
			properties: {
				category: {
					type: "string",
					required: true,
					enum: [
						"blocking_bug",
						"acceptance_gap",
						"test_weakness",
						"follow_up_candidate"
					]
				},
				summary: {
					type: "string",
					required: true
				},
				notes: { type: "string" },
				file_references: {
					type: "array",
					items: { type: "string" }
				},
				test_commands: {
					type: "array",
					items: { type: "string" }
				}
			}
		}
	}
};
/** Validate completion semantics before the value can leave the DSH worker. */
function validateCompletion(value) {
	const input = record(value);
	if (input === void 0 || input.verdict !== "looks_good" && input.verdict !== "changes_requested") throw new Error("complete_review requires a valid verdict");
	rejectUnexpectedKeys(input, [
		"verdict",
		"notes",
		"evidence",
		"new_findings",
		"prior_finding_resolutions"
	], "complete_review");
	const findings = optionalFindings(input.new_findings);
	const resolutions = optionalResolutions(input.prior_finding_resolutions);
	if (input.verdict === "looks_good" && findings.length > 0) throw new Error("looks_good cannot contain new_findings");
	if (input.verdict === "changes_requested" && findings.length === 0) throw new Error("changes_requested requires a current-round new finding");
	return {
		verdict: input.verdict,
		...optionalText("notes", input.notes),
		...optionalText("evidence", input.evidence),
		...findings.length === 0 ? {} : { new_findings: findings },
		...resolutions.length === 0 ? {} : { prior_finding_resolutions: resolutions }
	};
}
/** A trusted local controller which owns every hidden DSH reviewer worker. */
var ReviewerRuntime = class {
	ctx;
	config;
	workers = /* @__PURE__ */ new Map();
	operations = /* @__PURE__ */ new Map();
	acquisitions = /* @__PURE__ */ new Map();
	capacity;
	options;
	profile;
	configurationError;
	controller;
	controllerCreating;
	reservations = 0;
	stopped = false;
	constructor(ctx, config) {
		this.ctx = ctx;
		this.config = config;
		const provider = config.reviewerProvider;
		const model = config.reviewerModel;
		this.configurationError = provider === void 0 !== (model === void 0) ? "reviewerProvider and reviewerModel must be configured together" : config.reviewerCapacity === void 0 || !Number.isInteger(config.reviewerCapacity) || config.reviewerCapacity < 1 ? "reviewerCapacity must be a positive integer" : config.reviewerProfilePath === void 0 || config.reviewerProfilePath.trim() === "" ? "reviewerProfilePath is required" : void 0;
		this.capacity = config.reviewerCapacity ?? 0;
		this.options = provider === void 0 || model === void 0 ? void 0 : {
			provider,
			model,
			...config.reviewerEffort === void 0 ? {} : { reasoningEffort: config.reviewerEffort }
		};
		this.profile = config.reviewerProfilePath === void 0 ? Promise.resolve("") : readFile(config.reviewerProfilePath, "utf8").then((profile) => `${profile.trim()}\n\nManaged review runtime: use only complete_review to submit a review verdict. Do not call Den directly. A looks_good verdict cannot include new findings. A changes_requested verdict requires at least one current-round new finding.\n`);
	}
	/** Return configuration and aggregate pool state without agent identities. */
	async status() {
		const error = await this.readinessError();
		return {
			ready: error === void 0 && !this.stopped,
			capacity: this.capacity,
			workers: this.workers.size,
			active: [...this.workers.values()].filter((worker) => worker.active !== void 0).length,
			...error === void 0 ? {} : { error }
		};
	}
	/** Idempotently reserve one hidden reviewer worker for a local operation. */
	async acquire(operationId, workspace) {
		this.requireReady();
		const current = this.operations.get(operationId);
		if (current !== void 0) {
			const worker = this.requireWorker(current);
			if (worker.workspace !== workspace) throw new Error("operation_id already belongs to a different workspace");
			return {
				worker_id: worker.id,
				replayed: true
			};
		}
		const pending = this.acquisitions.get(operationId);
		if (pending !== void 0) {
			if (pending.workspace !== workspace) throw new Error("operation_id already belongs to a different workspace");
			return {
				...await pending.result,
				replayed: true
			};
		}
		if (this.workers.size + this.reservations >= this.capacity) throw new Error("reviewer capacity reached");
		this.reservations++;
		const result = this.createWorker(operationId, workspace).finally(() => {
			this.reservations--;
			this.acquisitions.delete(operationId);
		});
		this.acquisitions.set(operationId, {
			workspace,
			result
		});
		return await result;
	}
	async createWorker(operationId, workspace) {
		const readiness = await this.readinessError();
		if (readiness !== void 0) throw new Error(readiness);
		const controller = await this.ensureController(workspace);
		const id = randomUUID();
		const profile = await this.profile;
		const runtime = this;
		const workerOptions = this.resolveAgentOptions();
		const worker = {
			id,
			handle: await controller.agent.ctx.agents.create({
				sessionId: randomUUID(),
				meta: {
					cwd: workspace,
					parentSession: controller.agent.id,
					origin: "subagent"
				},
				...workerOptions === void 0 ? {} : { agentOptions: workerOptions },
				setup: async (workerCtx) => {
					if (this.config.reviewerPreset !== void 0) await workerCtx.agentPresets.mount(workerCtx, this.config.reviewerPreset);
					workerCtx.systemPrompt.section({
						name: "crew-review:profile",
						order: 65,
						text: profile
					});
					workerCtx.tools.register(defineTool({
						name: "complete_review",
						description: "Submit the structured managed review result. A looks_good verdict cannot include new findings. A changes_requested verdict requires at least one current-round new finding.",
						parameters: completionParameters,
						output: {
							schema: completionOutput,
							render: (_args, output) => [{
								type: "text",
								text: JSON.stringify(output)
							}]
						},
						async execute(args) {
							return await runtime.acceptCompletion(id, args);
						}
					}));
				}
			}),
			workspace,
			operations: new Set([operationId]),
			results: /* @__PURE__ */ new Map(),
			active: void 0,
			released: false
		};
		this.workers.set(id, worker);
		this.operations.set(operationId, id);
		return {
			worker_id: id,
			replayed: false
		};
	}
	/** Drive exactly one worker turn and return only its accepted completion. */
	async run(workerId, runId, prompt, signal) {
		const worker = this.requireWorker(workerId);
		const replay = worker.results.get(runId);
		if (replay !== void 0) return {
			...replay,
			replayed: true
		};
		if (worker.active !== void 0) {
			if (worker.active.id !== runId || worker.active.result === void 0) throw new Error("reviewer worker already has an active run");
			return {
				...await worker.active.result,
				replayed: true
			};
		}
		const active = deferred(runId);
		worker.active = active;
		active.result = this.drive(worker, active, prompt, signal);
		return await active.result;
	}
	async drive(worker, active, prompt, signal) {
		const stop = () => {
			this.cancel(worker, active);
		};
		signal?.addEventListener("abort", stop, { once: true });
		try {
			worker.handle.agent.followup(createUserMessage({
				content: [{
					type: "text",
					text: prompt
				}],
				source: {
					kind: "reviewer-runtime",
					runId: active.id
				}
			}));
			await worker.handle.agent.whenIdle();
			if (!active.settled) throw new Error("DSH reviewer turn completed without complete_review");
			const completion = await active.completion;
			const result = {
				worker_id: worker.id,
				run_id: active.id,
				completion,
				replayed: false
			};
			worker.results.set(active.id, result);
			return result;
		} finally {
			signal?.removeEventListener("abort", stop);
			if (worker.active === active) worker.active = void 0;
		}
	}
	/** Dispose an idle reviewer worker; repeated releases are harmless. */
	async release(workerId) {
		const worker = this.workers.get(workerId);
		if (worker === void 0 || worker.released) return {
			worker_id: workerId,
			released: true,
			replayed: true
		};
		if (worker.active !== void 0) throw new Error("cannot release reviewer with an active run");
		worker.released = true;
		this.workers.delete(worker.id);
		for (const operation of worker.operations) this.operations.delete(operation);
		await worker.handle.dispose();
		return {
			worker_id: workerId,
			released: true,
			replayed: false
		};
	}
	/** Stop active work, await quiescence, and dispose the hidden worker tree. */
	async dispose() {
		this.stopped = true;
		await Promise.all([...this.workers.values()].map(async (worker) => {
			if (worker.active !== void 0) await this.cancel(worker, worker.active);
			await this.release(worker.id);
		}));
		this.operations.clear();
		if (this.controller !== void 0) {
			await this.controller.dispose();
			this.controller = void 0;
		}
	}
	async ensureController(workspace) {
		if (this.controller !== void 0) return this.controller;
		if (this.controllerCreating !== void 0) return await this.controllerCreating;
		const pending = this.createController(workspace);
		this.controllerCreating = pending;
		pending.then(() => {
			if (this.controllerCreating === pending) this.controllerCreating = void 0;
		}, () => {
			if (this.controllerCreating === pending) this.controllerCreating = void 0;
		});
		return await pending;
	}
	async createController(workspace) {
		const options = this.resolveAgentOptions();
		this.controller = await this.ctx.agents.create({
			sessionId: randomUUID(),
			meta: { cwd: workspace },
			...options === void 0 ? {} : { agentOptions: options }
		});
		return this.controller;
	}
	resolveAgentOptions() {
		return this.options ?? this.ctx.get("agentDefaultModel")?.currentSelection();
	}
	async readinessError() {
		if (this.configurationError !== void 0) return this.configurationError;
		try {
			await this.profile;
			return;
		} catch (error) {
			return `read reviewer profile: ${String(error)}`;
		}
	}
	requireReady() {
		if (this.stopped) throw new Error("reviewer runtime is stopped");
		if (this.configurationError !== void 0) throw new Error(this.configurationError);
	}
	requireWorker(id) {
		const worker = this.workers.get(id);
		if (worker === void 0 || worker.released) throw new Error("reviewer worker is no longer active");
		return worker;
	}
	async acceptCompletion(workerId, value) {
		const active = this.requireWorker(workerId).active;
		if (active === void 0) throw new Error("complete_review is no longer active");
		const completion = validateCompletion(value);
		if (active.settled) throw new Error("complete_review was already accepted for this run");
		active.settled = true;
		active.resolve(completion);
		return { accepted: true };
	}
	async cancel(worker, active) {
		if (worker.active !== active) return;
		worker.handle.agent.cancel({ kind: "user" });
		await worker.handle.agent.whenIdle();
		if (!active.settled) {
			active.settled = true;
			active.reject(/* @__PURE__ */ new Error("reviewer run canceled"));
		}
		if (worker.active === active) worker.active = void 0;
	}
};
/** Route the private runtime protocol and reject browser/LAN callers before parsing JSON. */
function reviewerRuntimeHandler(runtime) {
	return async (request, response) => {
		if (!isLoopbackAddress(request.socket.remoteAddress)) {
			respond(response, 403, { error: "reviewer runtime is loopback-only" });
			return;
		}
		if (request.method !== "POST") {
			response.writeHead(405, { allow: "POST" });
			response.end();
			return;
		}
		try {
			const body = await requestBody(request);
			const action = requiredText(body, "action");
			if (action === "status") respond(response, 200, await runtime.status());
			else if (action === "acquire") respond(response, 200, await runtime.acquire(requiredText(body, "operation_id"), requiredText(body, "workspace")));
			else if (action === "run") {
				const disconnect = observeClientDisconnect(request, response);
				try {
					respond(response, 200, await runtime.run(requiredText(body, "worker_id"), requiredText(body, "run_id"), requiredText(body, "prompt"), disconnect.signal));
				} finally {
					disconnect.dispose();
				}
			} else if (action === "release") respond(response, 200, await runtime.release(requiredText(body, "worker_id")));
			else respond(response, 400, { error: "unknown reviewer runtime action" });
		} catch (error) {
			respond(response, 409, { error: error instanceof Error ? error.message : String(error) });
		}
	};
}
/** Loopback includes IPv4-mapped and IPv6 localhost forms emitted by Node. */
function isLoopbackAddress(address) {
	return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}
/** Abort a running local request only when its peer disconnects before the response ends. */
function observeClientDisconnect(request, response) {
	const controller = new AbortController();
	const abort = () => {
		if (!response.writableEnded) controller.abort();
	};
	request.once("aborted", abort);
	response.once("close", abort);
	return {
		signal: controller.signal,
		dispose: () => {
			request.off("aborted", abort);
			response.off("close", abort);
		}
	};
}
function deferred(id) {
	let resolve;
	let reject;
	return {
		id,
		completion: new Promise((accept, fail) => {
			resolve = accept;
			reject = fail;
		}),
		result: void 0,
		resolve,
		reject,
		settled: false
	};
}
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function requiredText(value, key) {
	const text = value[key];
	if (typeof text !== "string" || text.trim() === "") throw new Error(`${key} is required`);
	return text;
}
function optionalText(key, value) {
	return typeof value === "string" ? { [key]: value } : {};
}
function optionalFindings(value) {
	if (value === void 0) return [];
	if (!Array.isArray(value)) throw new Error("new_findings must be an array");
	return value.map((entry) => {
		const finding = record(entry);
		if (finding === void 0 || typeof finding.summary !== "string" || finding.summary.trim() === "" || ![
			"blocking_bug",
			"acceptance_gap",
			"test_weakness",
			"follow_up_candidate"
		].includes(String(finding.category))) throw new Error("new_findings contains an invalid finding");
		rejectUnexpectedKeys(finding, [
			"category",
			"summary",
			"notes",
			"file_references",
			"test_commands"
		], "new_findings");
		return {
			category: finding.category,
			summary: finding.summary,
			...optionalText("notes", finding.notes),
			...optionalStringArray("file_references", finding.file_references),
			...optionalStringArray("test_commands", finding.test_commands)
		};
	});
}
function optionalResolutions(value) {
	if (value === void 0) return [];
	if (!Array.isArray(value)) throw new Error("prior_finding_resolutions must be an array");
	return value.map((entry) => {
		const resolution = record(entry);
		if (resolution === void 0 || !Number.isInteger(resolution.finding_id) || typeof resolution.verification_note !== "string" || ![
			"verified_fixed",
			"not_fixed",
			"superseded",
			"split_to_follow_up"
		].includes(String(resolution.status))) throw new Error("prior_finding_resolutions contains an invalid resolution");
		rejectUnexpectedKeys(resolution, [
			"finding_id",
			"status",
			"verification_note"
		], "prior_finding_resolutions");
		return {
			finding_id: resolution.finding_id,
			status: resolution.status,
			verification_note: resolution.verification_note
		};
	});
}
function optionalStringArray(key, value) {
	if (value === void 0) return {};
	if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) throw new Error(`${key} must be an array of strings`);
	return { [key]: value };
}
function rejectUnexpectedKeys(value, allowed, label) {
	if (Object.keys(value).some((key) => !allowed.includes(key))) throw new Error(`${label} contains an unexpected field`);
}
async function requestBody(request) {
	const chunks = [];
	for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	const value = record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
	if (value === void 0) throw new Error("reviewer runtime request must be a JSON object");
	return value;
}
function respond(response, status, body) {
	response.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	response.end(JSON.stringify(body));
}
//#endregion
//#region \0@oxc-project+runtime@0.135.0/helpers/esm/usingCtx.js
function _usingCtx() {
	var r = "function" == typeof SuppressedError ? SuppressedError : function(r, e) {
		var n = Error();
		return n.name = "SuppressedError", n.error = r, n.suppressed = e, n;
	}, e = {}, n = [];
	function using(r, e) {
		if (null != e) {
			if (Object(e) !== e) throw new TypeError("using declarations can only be used with objects, functions, null, or undefined.");
			if (r) var o = e[Symbol.asyncDispose || Symbol["for"]("Symbol.asyncDispose")];
			if (void 0 === o && (o = e[Symbol.dispose || Symbol["for"]("Symbol.dispose")], r)) var t = o;
			if ("function" != typeof o) throw new TypeError("Object is not disposable.");
			t && (o = function o() {
				try {
					t.call(e);
				} catch (r) {
					return Promise.reject(r);
				}
			}), n.push({
				v: e,
				d: o,
				a: r
			});
		} else r && n.push({
			d: e,
			a: r
		});
		return e;
	}
	return {
		e,
		u: using.bind(null, !1),
		a: using.bind(null, !0),
		d: function d() {
			var o, t = this.e, s = 0;
			function next() {
				for (; o = n.pop();) try {
					if (!o.a && 1 === s) return s = 0, n.push(o), Promise.resolve().then(next);
					if (o.d) {
						var r = o.d.call(o.v);
						if (o.a) return s |= 2, Promise.resolve(r).then(next, err);
					} else s |= 1;
				} catch (r) {
					return err(r);
				}
				if (1 === s) return t !== e ? Promise.reject(t) : Promise.resolve();
				if (t !== e) throw t;
			}
			function err(n) {
				return t = t !== e ? new r(n, t) : n, next();
			}
			return next();
		}
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
	reviewerRuntime;
	constructor(ctx, config = {}) {
		super(ctx, "crewMessaging");
		this.runtime = new DshRuntime(ctx);
		this.reviewerRuntime = new ReviewerRuntime(ctx, config);
		this.service = new CrewMessagingService(new FabricClient(config.url ?? "http://127.0.0.1:8787"), this.runtime, config, this.runtime);
		const dashboard = crewDashboardHandler({
			adapter: this.service,
			tuning: dashboardTuning(config),
			fabricUrl: config.url ?? "http://127.0.0.1:8787"
		});
		const reviewUrl = config.reviewUrl ?? "http://127.0.0.1:8413";
		const reviewDashboard = crewReviewDashboardHandler({ reviewUrl });
		const reviewAffinity = crewReviewAffinityHandler({ reviewUrl });
		const reviewRetry = crewReviewRetryHandler({ reviewUrl });
		const fabricUrl = config.url ?? "http://127.0.0.1:8787";
		const sessions = crewForeignSessionsHandler({ fabricUrl });
		const events = crewForeignSessionEventsHandler({ fabricUrl });
		const stream = crewForeignSessionEventsStreamHandler({ fabricUrl });
		const prompt = crewForeignSessionPromptHandler({ adapter: this.service });
		const inbox = crewWorkbenchInboxHandler({
			fabricUrl,
			...config.workbenchAddress === void 0 ? {} : { workbenchAddress: config.workbenchAddress }
		});
		const controls = codexControlHandler(new CodexControlClient(config.codexControlUrl ?? "http://127.0.0.1:8788"));
		const reviewerRuntime = reviewerRuntimeHandler(this.reviewerRuntime);
		ctx.inject(["webServer"], (webCtx) => {
			const webServer = webCtx.get("webServer");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_DASHBOARD_PATH,
				handler: dashboard
			}), "crew-messaging: dashboard route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_REVIEW_DASHBOARD_PATH,
				handler: reviewDashboard
			}), "crew-messaging: review dashboard route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_REVIEW_AFFINITY_PATH,
				handler: reviewAffinity
			}), "crew-messaging: review affinity route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_REVIEW_RETRY_PATH,
				handler: reviewRetry
			}), "crew-messaging: review retry route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_SESSIONS_PATH,
				handler: sessions
			}), "crew-messaging: foreign sessions route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_SESSION_EVENTS_PATH,
				handler: events
			}), "crew-messaging: foreign session events route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_SESSION_EVENTS_STREAM_PATH,
				handler: stream
			}), "crew-messaging: foreign session event stream route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_SESSION_PROMPT_PATH,
				handler: prompt
			}), "crew-messaging: foreign session prompt route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_WORKBENCH_INBOX_PATH,
				handler: inbox
			}), "crew-messaging: workbench inbox route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_CODEX_CREATE_PATH,
				handler: controls
			}), "crew-messaging: Codex create route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_CODEX_CAPABILITIES_PATH,
				handler: controls
			}), "crew-messaging: Codex capabilities route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_CODEX_INTERRUPT_PATH,
				handler: controls
			}), "crew-messaging: Codex interrupt route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_CODEX_INTERACTIONS_PATH,
				handler: controls
			}), "crew-messaging: Codex interactions route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_CODEX_RESPOND_PATH,
				handler: controls
			}), "crew-messaging: Codex response route");
			webCtx.effect(() => webServer.register({
				kind: "exact",
				path: CREW_REVIEWER_RUNTIME_PATH,
				handler: reviewerRuntime
			}), "crew-messaging: reviewer runtime route");
		});
		const disposeTools = installScopedTools(ctx, this.service);
		ctx.effect(() => {
			this.service.start().catch((error) => ctx.logger.warn(`crew messaging start: ${String(error)}`));
			return async () => {
				disposeTools();
				await this.service.dispose();
				await this.reviewerRuntime.dispose();
				await this.runtime.dispose();
			};
		}, "crewMessaging.lifecycle()");
	}
	/** Model-safe directory projection for other same-process plugin consumers. */
	directory() {
		return this.service.directory();
	}
	/** Model-safe local adapter state for other same-process plugin consumers. */
	status() {
		return this.service.status();
	}
	/** Refresh subscription emitted after the directory map is coherent. */
	onDirectoryChanged(listener) {
		return this.service.onDirectoryChanged(listener);
	}
	/** Submit a browser workbench prompt through this provider's held fabric lease. */
	sendWorkbench(sessionId, operationId, text) {
		return this.service.sendWorkbench(sessionId, operationId, text);
	}
};
var DshRuntime = class {
	ctx;
	handles = /* @__PURE__ */ new Map();
	resumes = /* @__PURE__ */ new Map();
	coldTitles = /* @__PURE__ */ new Map();
	constructor(ctx) {
		this.ctx = ctx;
	}
	async discover() {
		const values = /* @__PURE__ */ new Map();
		for (const agent of this.ctx.agents.roots()) this.addDiscovered(values, String(agent.id), agent.session.header.origin, agent.session.events);
		const persistence = this.ctx.get("sessionPersistence");
		if (persistence === void 0) return [...values.values()];
		const snapshots = await persistence.listSnapshots();
		const nextCold = /* @__PURE__ */ new Map();
		for (const snapshot of snapshots) {
			const sessionId = String(snapshot.header.id);
			if (values.has(sessionId) || snapshot.header.origin === "subagent") continue;
			const cached = this.coldTitles.get(sessionId);
			if (cached?.revision === snapshot.revision) nextCold.set(sessionId, cached);
			else {
				const inspected = await persistence.inspect(snapshot.header.id);
				const binding = discoveredFromEvents(sessionId, inspected.meta.origin, inspected.events);
				nextCold.set(sessionId, {
					revision: snapshot.revision,
					binding
				});
			}
			const binding = nextCold.get(sessionId)?.binding;
			if (binding !== void 0) values.set(sessionId, binding);
		}
		this.coldTitles = nextCold;
		return [...values.values()];
	}
	onChanged(listener) {
		const stopEvent = this.ctx.on("session/event", (session, event) => {
			if (event.type === "session/title" && this.root(String(session.id)) !== void 0) listener();
		});
		const stopDisposed = this.ctx.on("session/disposed", () => listener());
		return () => {
			stopEvent();
			stopDisposed();
		};
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
				text: frameCrewDelivery(envelope)
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
	addDiscovered(values, sessionId, origin, events) {
		const binding = discoveredFromEvents(sessionId, origin, events);
		if (binding !== void 0) values.set(sessionId, binding);
	}
	async resumeExact(sessionId) {
		try {
			var _usingCtx$1 = _usingCtx();
			const id = sessionId;
			const existing = this.root(sessionId);
			if (existing !== void 0) return existing;
			const query = this.ctx.get("sessionQuery");
			if (query === void 0) return void 0;
			const observed = _usingCtx$1.u(await query.observeSession(id));
			if (observed.header.origin === "subagent") return void 0;
			const afterInspect = this.root(sessionId);
			if (afterInspect !== void 0) return afterInspect;
			if (observed.projections === void 0) throw new Error(`session ${sessionId} observation omitted projections`);
			const preset = observed.projections.values.agentPreset ?? void 0;
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
		} catch (_) {
			_usingCtx$1.e = _;
		} finally {
			_usingCtx$1.d();
		}
	}
	/** A bound root never adopts a same-id live subagent. */
	root(sessionId) {
		return this.ctx.agents.roots().find((agent) => agent.id === sessionId);
	}
};
/** Fold only durable explicit renames; automatic names never become fabric addresses. */
function explicitUserTitle(events) {
	const title = foldSessionTitle(events);
	return title?.source.kind === "user" ? title.title : void 0;
}
/** Convert one eligible root's durable log into a title address, if the user pinned one. */
function discoveredFromEvents(sessionId, origin, events) {
	if (origin === "subagent") return void 0;
	const title = explicitUserTitle(events);
	return title === void 0 ? void 0 : {
		address: title,
		sessionId
	};
}
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
export { CrewMessagingProvider, acceptedMessages, apply, apply as default, explicitUserTitle };
