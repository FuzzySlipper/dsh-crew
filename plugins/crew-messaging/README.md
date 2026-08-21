# dsh-crew-messaging

`dsh-crew-messaging` is an out-of-tree DSH bundle that maps explicitly selected root sessions to local crew-messaging fabric addresses. It owns no Web UI and makes no change to DSH or the fabric service.

Each configured binding is `{ address, sessionId }`. The adapter treats `sessionId` as its opaque fabric `target_ref`; the fabric does not parse it. Explicit configuration remains authoritative, but root sessions with an explicit user rename also become dynamic addresses: rename a root to `B` and its fabric address is `B`. The adapter calls DSH's public `foldSessionTitle()` and accepts only its `source.kind === 'user'` result, so automatic titles and durable subagents are excluded. Dynamic aliases compare case-insensitively; duplicate titles such as `B` and `b` are deliberately unroutable until the collision is resolved. A currently bound alias belonging to another adapter is likewise left unavailable; a configured collision instead remains a loud operator error. A rename or disappeared root retires the adapter-owned old binding with revision fencing, while unrelated or stale fabric rows are left alone. Discovery reads both live roots and cold persisted roots; a failed catalog scan retains the previous dynamic map. This first adapter intentionally permits exactly one address per root and one root per address; duplicate configured `address` or `sessionId` configuration fails at construction. Only explicitly configured roots currently receive the scoped `crew_addresses` and `crew_message` tools. The send tool derives the sender address from its calling Agent and uses `${sessionId}:${callId}` for fabric idempotency. A reply optionally carries the exact `reply_to_message_id`.

Delivery is per-address serialized. The adapter resolves the exact root before it starts fabric dispatch; an unavailable cold target releases the claim because no native insertion was attempted. Before `followup()` it then starts fabric dispatch with a stable native attempt ref, flushes the DSH session, confirms the immutable `crew-messaging` source identity in `user/message` or durable `next-turn` inbox data, and acknowledges. `followup()` is the sole wake mapping: busy Agents receive queued next-turn work without steer, cancel, or injection. A cold target is inspected, rejects known durable subagent sessions, then resumes once per SessionId. The plugin retains and disposes only handles it created; publisher races adopt the winning root. Presets are reconstructed with `resolveSessionPreset` and mounted through the public `agentPresets` service when it is composed.

Every delivered model message starts with a compact JSON header containing `message_id`, `from`, `to`, `kind` (`ordinary` or `reply`), and `reply_to_message_id` for replies. It follows with an exact `crew_message` reply instruction and a separately delimited JSON body string. The frame contains fabric aliases only—never a DSH session id, target ref, lease, or delivery id—and its structured body keeps marker-like message content from being interpreted as delivery metadata. The native source record is unchanged and remains the acceptance proof.

On restart the adapter inspects its own dispatching deliveries. A proven native identity is flushed and acknowledged; anything not provable is terminalized as `outcome_unknown`, never blindly redelivered. Lease tokens remain internal and are not exposed by the service or tools.

## Local current-source use

From the `dsh-crew` repository root, use the nested checkout's installed toolchain:

```sh
pnpm --dir research/deepseek-harness exec tsc --noEmit -p ../../plugins/crew-messaging/tsconfig.json
pnpm --dir research/deepseek-harness exec vitest run --config ../../plugins/crew-messaging/vitest.config.ts
pnpm --dir research/deepseek-harness exec tsdown --config ../../plugins/crew-messaging/tsdown.config.ts --tsconfig ../../plugins/crew-messaging/tsconfig.json
```

Build the local bundle, then add it to the DSH web profile. `dsh plugin add` reads and applies the bundle's `cordis.patch.yml`; do not apply that patch separately. The patch defaults to `http://127.0.0.1:8787`, `dsh-crew-messaging`, and one stable trusted-box instance id. Set `DSH_CREW_MESSAGING_URL`, `DSH_CREW_MESSAGING_ADAPTER_ID`, `DSH_CREW_MESSAGING_INSTANCE_ID`, and `DSH_CREW_MESSAGING_BINDINGS` (a JSON array) in the web service environment as described in [the agent-box setup](docs/agent-box-setup.md). Deployment tuning is explicit in the provider config: `leaseDuration`, `renewMs`, `pollMs`, `claimDuration`, `ttl`, `acceptanceTimeoutMs`, and `acceptancePollMs`. The bounded acceptance wait covers DSH's brief handoff between removal from the pending inbox and append of the canonical durable user message; it never retries native insertion.

Current limitation: cold recovery rejects sessions whose persisted header is explicitly `origin: 'subagent'`; a non-subagent root with an unavailable persistence backend remains queued in the fabric. The adapter cannot prove model processing or replies—only native DSH acceptance.

See [the agent-box setup](docs/agent-box-setup.md) for the profile, bundle, restart, and real local fabric probe path. The sibling [crew-services runbook](../../../crew-services/docs/agent-box-runbook.md) owns the local binary and SQLite operation path.
