import { Context } from "@deepseek-ai/cordis";

//#region src/index.d.ts
declare const name = "dsh-crew-inject";
declare const inject: string[];
/** POST {sessionId, requestId, content} -> {accepted: true}. */
declare const CREW_INJECT_PATH = "/api/crew-inject/inject";
declare function apply(ctx: Context): void;
//#endregion
export { CREW_INJECT_PATH, apply, inject, name };