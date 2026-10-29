import { createUserMessage } from "@deepseek-ai/dsh-llm";
//#region src/index.ts
const name = "dsh-crew-inject";
const inject = ["agents", "connection"];
/** POST {sessionId, requestId, content} -> {accepted: true}. */
const CREW_INJECT_PATH = "/api/crew-inject/inject";
function apply(ctx) {
	ctx.connection.fetch.register({
		path: CREW_INJECT_PATH,
		methods: ["POST"],
		requestBody: "buffered",
		fetch: async (request) => handle(ctx, request)
	});
}
async function handle(ctx, request) {
	const body = parse(await request.json().catch(() => void 0));
	if (body === void 0) return reply(400, {
		accepted: false,
		code: "gateway/bad-request",
		message: "sessionId, requestId and non-empty content are required"
	});
	const agent = ctx.agents.roots().find((candidate) => candidate.id === body.sessionId);
	if (agent === void 0) return reply(409, {
		accepted: false,
		code: ctx.agents.get(body.sessionId) === void 0 ? "session/not-loaded" : "session/subagent",
		message: `session "${body.sessionId}" has no live root agent`
	});
	if (holdsRequest(agent, body.requestId)) return reply(200, {
		accepted: true,
		replayed: true
	});
	agent.inject(createUserMessage({
		content: [{
			type: "text",
			text: body.content
		}],
		source: {
			kind: "user",
			rpcId: body.requestId
		}
	}));
	return reply(200, { accepted: true });
}
function parse(value) {
	if (typeof value !== "object" || value === null) return void 0;
	const { sessionId, requestId, content } = value;
	if (typeof sessionId !== "string" || sessionId === "" || typeof requestId !== "string" || requestId === "") return void 0;
	if (typeof content !== "string" || content.trim() === "") return void 0;
	return {
		sessionId,
		requestId,
		content
	};
}
/**
* The same test as session/prompt's own `hasPromptRequest`: a user-sourced
* message with this rpcId in either inbox or in the session history. The
* message carries session/prompt's source shape, so crew-dsh's reconcile
* reads (session/state queue, inbox splices, user messages) find it too.
*/
function holdsRequest(agent, requestId) {
	const matches = (message) => {
		const source = message.source;
		return source.kind === "user" && source.rpcId === requestId;
	};
	if (agent.inbox.nextTurn.some(matches) || agent.inbox.nextStep.some(matches)) return true;
	return agent.session.snapshotEvents().some((event) => event.type === "user/message" && matches(event.data));
}
function reply(status, value) {
	return new Response(JSON.stringify(value), {
		status,
		headers: {
			"content-type": "application/json",
			"cache-control": "no-store"
		}
	});
}
//#endregion
export { CREW_INJECT_PATH, apply, inject, name };
