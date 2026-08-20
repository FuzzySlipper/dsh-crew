# Experiment 01: Rusty Crew ↔ DSH Sidecar

## Purpose

Build a durable integration in which a DSH-backed agent becomes a full Rusty Crew citizen without forcing either project to surrender its current responsibilities immediately.

The initial deployment shape resembles Rusty Crew's existing Codex App Server lane: Crew supervises an external runtime and presents it through Crew services and UI. The crucial difference is that the external runtime is not an opaque product session. It is a real DSH/Cordis application that can gradually absorb generic harness responsibilities.

This is intended to be an **inversion-ready boundary**:

```text
initially

Rusty Crew
  └─ supervises crew-dsh sidecar
       └─ runs DSH agents and plugins

possibly later

crew-dsh Cordis application
  ├─ runs DSH agents and ecosystem plugins
  └─ consumes selected Rusty Crew services over RPC
```

The transport contract should survive that inversion.

## Main hypothesis

Crew can retain durable organization, governance, and selected Rust authorities while DSH owns generic execution, provider, memory, skill, session-runtime, and browser-workbench machinery.

A successful experiment should reduce Crew's generic ownership surface rather than reproduce Crew inside DSH one package at a time.

## Proposed topology

```text
Rusty View / Crew API
          │
          ▼
Rusty Crew authority services
  identity / tasks / messages / review / catalog
          │
          │ versioned duplex protocol
          ▼
crew-dsh bridge plugin
          │
          ▼
DSH/Cordis application
  agents / sessions / providers / tools / memory / skills
```

The bridge should be duplex. Crew needs to drive DSH sessions, while DSH agents need typed access to Crew capabilities.

## Initial source-of-truth split

| Concern | Initial authority |
|---|---|
| Persistent Crew agent identity and role | Rusty Crew |
| Agent organization, relationships, and presence policy | Rusty Crew |
| Task ownership and inter-agent messaging | Rusty Crew |
| Review pipeline, GitHub state, and exact-SHA CI governance | Rusty Crew |
| Human-facing cross-runtime session catalog | Rusty Crew |
| DSH session event log | DSH |
| Live DSH agent activation and inbox | DSH |
| DSH provider, tool, memory, skill, and loop composition | DSH |
| Rusty View representation | Derived projection |
| Protocol admission and compatibility policy | Rusty Crew initially |

This table is an experiment assumption, not a permanent constitution. Changes to it should be deliberate and documented.

## Identity model

Keep organizational identity, durable work threads, and live execution separate:

```text
CrewAgentId
  stable organizational actor

CrewSessionId / DshSessionId
  durable work or conversation thread

DshAgent activation
  temporary live executor hydrated over a session
```

Where practical, use the Crew session UUID directly as the DSH session ID. Do not equate a Crew agent ID with a DSH session ID. One persistent Crew agent may own several sessions.

## Bridge protocol

Do not copy the current DSH Web protocol as the permanent Crew runtime contract. Build a narrow, versioned, runtime-neutral protocol around public DSH services.

Suggested control methods:

```text
runtime.hello
runtime.describe
runtime.reconcile

session.create
session.resume
session.deliver
session.steer
session.inject
session.cancel
session.dehydrate
session.inspect
session.reconfigure

events.subscribe
events.replay
```

Suggested DSH-to-Crew capability methods:

```text
crew.agents.lookup
crew.messages.send
crew.tasks.get
crew.tasks.update
crew.review.request
crew.review.inspect
crew.artifacts.publish
```

Use generated contracts in Rust and TypeScript. The handshake should include:

- protocol version;
- DSH revision and session-format version;
- installed Crew bridge capability set;
- supported event types;
- optional feature flags;
- contract fingerprint.

## Durable events versus live activity

The bridge should distinguish replayable durable facts from ephemeral presentation updates.

```text
session.event
  durable
  sequenced
  replayable after reconnect

activity.delta
  ephemeral
  useful for live UI
  never a source of truth
```

Crew should store the last observed DSH session sequence number. After reconnect it requests the missing range before resuming live delivery.

Do not treat agent status notifications as transcript recovery.

## DSH-side service design

Avoid one giant `ctx.crew` escape hatch. Build one transport service and several domain services:

```text
ctx.crewRpc

ctx.crewAgents
ctx.crewMessages
ctx.crewTasks
ctx.crewReviews
ctx.crewArtifacts
```

Model-facing tools depend on the narrow domain service they use:

```text
tool-crew-message
  requires crewMessages

tool-crew-review
  requires crewReviews

tool-crew-delegate
  requires crewAgents + crewTasks
```

This preserves inspectable Cordis topology and lets agent presets receive different Crew capabilities.

## Session lifecycle

Connection lifetime must not own session lifetime.

```text
bridge disconnects
  session remains durable
  live autonomous work follows explicit policy
  missed durable events remain replayable

bridge reconnects
  handshake
  reconcile desired live roster
  replay missed events
  resume live delivery
```

Define `dehydrate` separately from delete:

```text
session.dehydrate
  wait for a safe quiescent point
  flush session persistence
  dispose the live DSH Agent handle
  retain the durable session

session.resume
  prepare persisted session
  construct fresh scoped agent world
  publish activation
```

## Review pipeline integration

Do not reimplement Crew's review system in DSH.

A DSH tool such as `crew_request_review` should return a durable ticket quickly:

```text
review.requested
  ticket id
  repository
  exact commit SHA
  requested policy
```

Crew performs its existing GitHub and CI work. The result later returns through an appropriate agent boundary:

- `inject` for informational context that should wait;
- `steer` for a result relevant to the current turn;
- `followup` for a result that should wake an idle agent.

The review ticket and final result should remain inspectable independently of whether the DSH agent is currently hydrated.

## Minimum credible implementation

The first complete slice should support:

1. Start a pinned `crew-dsh` distribution as a supervised sidecar.
2. Create one DSH-backed session under a Crew-selected session ID.
3. Present live status and session events to Rusty View.
4. Deliver a durable message from a native Crew agent to the DSH agent.
5. Expose one Crew messaging tool and one Crew review tool through Cordis services.
6. Run one existing DSH memory or skill plugin unchanged.
7. Request Crew's exact-SHA review pipeline.
8. Return the asynchronous result to the same session.
9. Restart both processes and cold-resume the session.
10. Disconnect and reconnect the bridge without losing durable events.
11. Export service and event topology for drift checking.

A simple prompt round trip is useful during development but does not complete the experiment.

## Workstreams

### Contract and authority

- Define IDs and source-of-truth rules.
- Define the versioned duplex protocol.
- Generate Rust and TypeScript contracts.
- Specify replay, idempotency, and compatibility behavior.

### DSH distribution

- Pin a DSH revision.
- Compose the host profile.
- Mount bridge and Crew-domain plugins.
- Choose one memory/skill plugin for the proving scenario.

### Crew runtime adapter

- Add an `external-runtime-dsh` lane.
- Supervise process and socket lifecycle.
- Reconcile desired sessions and live activations.
- Ingest durable and ephemeral event channels separately.

### Rusty View projection

- Add runtime-neutral representation for DSH activity.
- Preserve source sequence IDs on projected durable events.
- Link a Crew session to its DSH workbench URL when available.

### Adversarial verification

- Duplicate delivery.
- Reordered or replayed messages.
- Process crash during a turn.
- Bridge disconnect during a tool call.
- Restart with queued inbox work.
- DSH revision upgrade with an old persisted session.
- Plugin unload during active work.

## Success criteria

- No DSH loop patch is required.
- Crew capabilities enter DSH through declared Cordis services.
- DSH provider changes require no provider-specific Crew code.
- The existing review pipeline remains authoritative and reusable.
- Sessions survive restart and reconnect without transcript divergence.
- Rusty View remains runtime-neutral rather than becoming a hidden DSH client implementation.
- Most added code expresses Crew-specific value or the narrow bridge.
- Generated topology remains understandable.

## Failure signals

- Repeated imports from DSH package internals.
- A growing private DSH patch stack.
- Two competing transcript authorities.
- Crew and DSH both believing they own live-session lifecycle decisions.
- Provider-specific behavior leaking back into Rusty Crew.
- Generic session, tool, memory, or provider machinery being rebuilt in `crew-dsh`.
- Reconnect requiring process restart or manual transcript repair.

## Growth path

If successful, new generic harness features should be implemented on the DSH side first. Crew can progressively concentrate on durable organization and governance while native Crew brains remain supported runtimes.

The later inversion of startup authority should be a deployment decision, not a rewrite.