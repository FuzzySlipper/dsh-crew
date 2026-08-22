# Next Crew messaging runtime adapter

The next adapter should target **Rusty Crew direct-brain sessions first**. It
should run at the Rusty Crew service edge, use Crew's existing routing and wake
authority, and translate between that runtime and the independent
`crew-services` messaging fabric. It must not move session ownership, brain
execution, or Codex App Server control into `crew-services`.

This is smaller than starting with managed Codex sessions. Direct-brain
delivery already has exact session routing, a durable accepted receipt, an
idle wake, and a noninterrupting active-session policy. Managed Codex adds a
controller lease, native thread and turn identity, native-event association,
and an ambiguity boundary after native dispatch.

## Boundary

```text
crew-services fabric
    durable message, claim, reply link
             |
             v
Rusty Crew messaging adapter
    alias binding, frame/tool translation, reconciliation
             |
             v
Rusty Crew coordination + wake dispatcher
    exact session, persistence, active/idle policy, brain execution
```

`crew-services` owns the runtime-neutral directory, message, delivery, and
round records. The adapter owns only the mapping and protocol translation.
Rusty Crew remains authoritative for its sessions, execution phase, wake
scheduling, and native acceptance record.

The adapter belongs beside Rusty Crew's service orchestration rather than in a
second sidecar which attempts to drive a brain. The public native bridge
already exposes address resolution, delivery, reply, rounds, receipts, inbox,
and traffic queries ([public API](../../rusty-crew/ts/packages/native-bridge/src/agent-coordination-public-api.ts)).
The TypeScript wake dispatcher also owns deferred wake execution; the Rust
N-API wake entry point deliberately does not own that callback
([bridge boundary](../../rusty-crew/crates/bridge/core-bridge-node/src/events.rs)).

## Runtime mapping

| Concern | First adapter rule | Existing authority |
| --- | --- | --- |
| Identity | Bind a fabric alias to an explicit revisioned Crew route and its exact session. Never use a raw reusable agent id as a live address. | Crew distinguishes reusable `agent_id` from execution `session_id`; ambiguous raw identities fail closed ([identity note](../../rusty-crew/docs/session-routing-identity.md), [resolver](../../rusty-crew/crates/core/core-engine/src/agent_coordination.rs)). |
| Active notification | Persist the incoming fabric delivery, then use Crew's queued next-wake path. Do not mutate or steer the current prompt. A later UI badge may expose pending work, but is not delivery authority. | Direct-brain execution phase is durable. The current wake dispatcher defers a wake already in flight only within its process; its in-flight/deferred sets are not restart or multi-host authority ([execution fold](../../rusty-crew/crates/core/core-engine/src/session_execution.rs), [wake dispatcher](../../rusty-crew/ts/packages/brain-island/src/service-wake-dispatch.ts), [mid-turn policy](../../rusty-crew/docs/adr/0003-mid-turn-delta-policy.md)). |
| Idle wake | Let Crew emit and execute `BrainWakeRequested` for the exact routed session. The adapter never runs the brain itself. | Message activation and accepted receipt are created in Crew's coordination engine ([delivery path](../../rusty-crew/crates/core/core-engine/src/agent_coordination.rs)). |
| Native acceptance | After fabric `begin-dispatch`, require Crew's durable accepted delivery/readback before acknowledging the fabric delivery. Transport ambiguity after the native mutation becomes `outcome_unknown`, not blind redelivery. | Crew persists message events, delivery receipts, and queued work ([events](../../rusty-crew/crates/core/core-persistence/src/repos/events.rs), [queue](../../rusty-crew/crates/core/core-persistence/src/repos/queued_messages.rs)). |
| Reply link | Frame the fabric message with aliases and `message_id`. Install a fabric-facing `crew_message` tool whose optional `reply_to_message_id` calls `crew-services`. A reply frame is terminal by default. | Crew's native `replyAgentMessage` remains useful for messages whose sender is another Crew session, but it cannot represent a DSH/fabric sender session. Cross-runtime reply authority stays in the fabric. |
| Restart | Re-register the adapter and bindings, then reconcile fabric `dispatching` rows against Crew's durable delivery/message readback. Do not use process-local wake sets as proof. | Crew rehydrates session/event state at bootstrap; wake in-flight/deferred sets are explicitly process-local ([bootstrap](../../rusty-crew/crates/core/core-engine/src/bootstrap.rs), [activity census](../../rusty-crew/docs/runtime-activity-census.md)). |

## Implemented direct-brain slice

The Rusty Crew direct-brain adapter is now implemented as an optional service
composition: leased alias bindings, exact direct-brain validation, durable
fabric pump/reconciliation, and bound-only `crew_directory` / `crew_message`
tools. Its local real-boundary smoke and agent-box configuration are documented
in the [Rusty Crew adapter runbook](../../rusty-crew/docs/crew-services-adapter-runbook.md).
The managed-Codex extension remains a second slice.

## First implementation slice

1. Add one Rusty Crew service-owned adapter with a stable adapter instance and
   explicit `fabric alias -> Crew @route` bindings. Begin with direct-brain
   targets only and reject ambiguous, archived, missing, or external targets.
2. Poll/claim through the existing `crew-services` delivery protocol. Resolve
   the route again before native dispatch and release the claim if the exact
   target is unavailable.
3. Translate the delivery into one Crew coordination message carrying a stable
   fabric delivery attempt identity. While the session is active, register it
   for the next wake; while idle, allow Crew's normal dispatcher to wake it.
4. Acknowledge only after durable Crew readback proves that exact native
   insertion. Reconcile a restart from the same readback. If post-dispatch
   ambiguity cannot be resolved, record `outcome_unknown` in the fabric; it is
   not a Rusty Crew delivery status.
5. Give bound direct-brain sessions `crew_directory` and `crew_message` tools.
   Use the proven DSH frame rule: ordinary messages explain how to make a
   linked reply when warranted; replies do not demand another reply.
6. Prove two direct-brain sessions can exchange an ordinary message and one
   linked reply, a busy recipient is not interrupted, an idle recipient wakes,
   and adapter/Rusty Crew restart does not duplicate delivery.

This slice should reuse the fabric HTTP contract and the Crew native bridge. It
does not need a new session API, brain runner, general event bus, or shared
transcript model.

## Why Codex is second

Rusty Crew already owns managed Codex lifecycle correctly, so the future
adapter should route through Crew rather than call Codex App Server directly.
The external binding includes Crew identity, native thread identity, delivery
policy, and a binding revision
([external runtime types](../../rusty-crew/crates/core/core-protocol/src/external_runtime.rs)).
Activation then selects a new external turn, queued next turn, or native steer
([external activation](../../rusty-crew/crates/core/core-engine/src/external_runtime.rs)).
Steering additionally requires controller lease and native event association
before the delivery can settle
([controller](../../rusty-crew/ts/packages/brain-island/src/service-external-runtime.ts)).

That is a tractable second adapter extension once the direct-brain translation
is proven. It is not useful complexity for the first non-DSH slice. A future
Codex extension should preserve Crew's native controller as the sole owner of
`thread/start`, `turn/start`, steering, and resume; the messaging adapter only
submits coordination work and reads durable outcomes.

## Known limitations

- A quiet-active UI notification is not part of the first delivery contract.
  The message remains durable and the active turn is not interrupted; a badge
  or next-turn queue projection can be added after the adapter works.
- Crew's generic operator HTTP ingress uses a system caller and therefore does
  not by itself provide cross-runtime reply provenance. The first adapter uses
  a narrow service-owned bridge/tool translation instead of pretending that
  native Crew reply identity covers fabric senders.
- Direct-brain queue TTL and capacity are currently Crew policy. The adapter
  must report a terminal native rejection to the fabric rather than silently
  changing either policy.
- This recommendation does not make Rusty Crew the fabric authority. It is the
  first runtime adapter and can eventually shrink as successor services absorb
  proven boundaries.
