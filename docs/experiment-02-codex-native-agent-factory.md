# Experiment 02: Codex App Server as a Native DSH Brain

## Purpose

Test whether DSH truly permits a foreign, model-native harness to replace the stock agent loop while retaining DSH's generic body:

- sessions and persistence;
- Cordis lifecycle and scoping;
- memory, skill, team, and policy plugins;
- browser workbench;
- Crew identity, messaging, tasks, and review services.

The experiment should implement Codex as a DSH `AgentFactory` and public `Agent`, not merely as:

- a generic LLM provider;
- a one-shot subagent;
- a CLI process wrapped through terminal scraping.

This is the strongest early test of DSH's claim that the loop is a real replaceable component rather than a nominal plugin around a fixed cognitive architecture.

## Why this distinction matters

Some models are trained or tuned around a particular harness, action grammar, prompt structure, native tools, or continuation protocol. Flattening those semantics into a generic completion and tool loop can reduce model performance even when the underlying model endpoint is identical.

The experiment therefore distinguishes:

```text
provider adapter
  translates an inference protocol

agent brain
  owns turn progression, continuation, native harness semantics,
  model-specific control flow, and interaction with native tools
```

Replacing the provider is not necessarily replacing the brain.

## Existing reference implementations

### Upstream DSH Codex subagent

DSH already ships a Codex subagent provider that starts `codex app-server --stdio`, creates an ephemeral native thread, runs one task, returns final text, and disposes the process.

It proves that a Cordis plugin can host the official App Server protocol, but it intentionally omits:

- continuation;
- resume;
- pooling;
- progress streaming;
- persistent product sessions;
- full DSH session projection.

### Community Codex App Server LLM adapter

The community `wingoo/codex-plugin-dsh` project exposes local Codex App Server as an ordinary DSH model route. It contains valuable reference work for:

- native Codex authentication and model discovery;
- replay checkpoints;
- images and image generation;
- translating Codex streams to DSH model output;
- bridging Codex dynamic tool calls through the DSH tool runtime.

Its deliberate ownership model keeps the stock DSH agent loop in charge. That is useful, but it does not answer whether the native Codex harness can be the DSH agent itself.

### Rusty Crew Codex external runtime

Rusty Crew already has mature machinery for:

- generated App Server protocol artifacts and fingerprints;
- capability probing and admission;
- multiplexing many native threads over one controller connection;
- runtime-neutral callbacks;
- server-request authority delegated to Rust;
- stable Unix-socket transport.

The experiment should reuse or abstract this machinery rather than restart App Server protocol work from scratch.

## Proposed topology

```text
DSH AgentRegistry
        │
        │ AgentFactory
        ▼
CodexAgentFactory
        │
        ├─ creates DSH Session
        ├─ creates agent-local Cordis scope
        ├─ creates DSH Inbox projection
        └─ binds a native Codex thread
                 │
                 ▼
         Codex App Server runtime
```

The resulting `CodexAgent` satisfies the public DSH `Agent` contract:

```text
id
session
inbox
status
ctx

send / followup / steer / inject
cancel
whenIdle
runMaintenance
```

It must not import or construct the stock package-private DSH loop implementation.

## Authority model

### Codex owns cognition

The native Codex thread is authoritative for:

- model-native continuation state;
- native turn and item progression;
- Codex-specific reasoning and protocol semantics;
- native harness behavior retained by policy;
- native replay or checkpoint identity.

### DSH owns interoperable runtime state

The DSH side is authoritative for:

- the public `Agent` lifecycle;
- Cordis scope and plugin ownership;
- durable DSH session events used by DSH plugins and UI;
- the inbox used by DSH and Crew callers;
- generic lifecycle observation;
- attachment and presentation integration where supported.

### Crew owns organizational state

Crew remains authoritative for:

- persistent actor identity and role;
- tasks, messages, and organizational relationships;
- review and CI governance;
- cross-runtime session cataloging.

## Session projection model

Do not rebuild the entire Codex prompt from DSH history for every model request. That would reduce the experiment back to an LLM adapter.

Instead:

```text
DSH inbox input
    ↓
CodexAgent driver
    ↓
native Codex thread/turn
    ↓
App Server events
    ↓
DSH Session event projection
```

Standard DSH events should be used where semantics genuinely match:

```text
turn/start
user/message
assistant/chunk
assistant/message
turn/end
```

Codex-specific events can extend the session vocabulary where necessary:

```text
codex/thread-bound
codex/checkpoint
codex/item
codex/reasoning
codex/native-tool
codex/protocol-warning
```

Do not distort a Codex event into a generic DSH event merely to satisfy an existing renderer. Prefer an explicit Codex event plus a presentation plugin.

## Inbox mapping

Suggested mapping from the public DSH Agent API:

```text
followup
  queue ordinary future native Codex turn and wake

steer
  deliver urgent input at the nearest supported Codex boundary and wake

inject
  provide non-waking context for the nearest supported boundary

cancel
  interrupt the active native turn and apply explicit inbox retention policy
```

The exact Codex protocol support for steering or injection must be verified. Where Codex lacks an exact equivalent, the adapter should:

1. document the semantic approximation;
2. persist what actually happened;
3. fail explicitly when silent approximation would be misleading.

## Native tools versus DSH tools

This is a central experiment choice, not an implementation detail.

Three modes are plausible.

### Mode A: Native Codex tools

Codex keeps its normal shell, file, web, MCP, and other native capabilities.

Advantages:

- maximum native harness fidelity;
- strongest test of model performance under its intended environment.

Costs:

- DSH tool policy and logging see less;
- Crew must bridge selected services into Codex through dynamic tools or MCP;
- duplicate tool ecosystems may exist.

### Mode B: DSH tools only

Disable Codex environment tools and bridge every action through DSH.

Advantages:

- one policy and durable tool log;
- direct compatibility with DSH tool plugins.

Costs:

- closer to the existing community LLM-adapter design;
- may sacrifice the native harness behavior the experiment exists to test.

### Mode C: Deliberate hybrid

Retain selected native Codex capabilities and expose Crew/DSH capabilities through a dedicated namespace.

This is the recommended proving mode. The policy should be explicit and inspectable, for example:

```text
native Codex
  shell / patch / repository inspection

DSH or Crew bridge
  inter-agent messaging
  task operations
  exact-SHA review request
  durable organization
```

Avoid two tools that perform the same authoritative mutation unless their precedence is unambiguous.

## Runtime abstraction

Place App Server ownership behind a narrow interface:

```text
CodexRuntime
  createThread
  resumeThread
  startTurn
  steerTurn
  interruptTurn
  subscribe
  dispose
```

Provide at least two implementations or adapters over time:

```text
LocalCodexRuntime
  DSH subprocess service
  direct app-server stdio

CrewCodexRuntime
  existing Rusty Crew controller
  Unix socket / WebSocket
  Crew capability admission and multiplexing
```

`CodexAgent` should not care which process owner serves the protocol.

## Persistence and resume

A durable session needs enough state to recover both sides:

```text
DSH session id
Codex thread/checkpoint identity
Codex protocol/runtime version evidence
native tool-catalog signature
last completed turn/item boundary
projection sequence watermark
configuration digest
```

Resume should verify compatibility before publishing the agent.

Potential outcomes:

```text
compatible
  resume native thread and continue

rebuildable
  create new native thread and import representable DSH history

incompatible
  refuse clearly and preserve the session for migration or inspection
```

Never silently discard native reasoning, unsupported images, tool history, or other state merely to make resume appear successful.

## Factory publication sequence

Follow the DSH public creation contract:

1. Prepare or load the DSH session privately.
2. Construct the Codex runtime binding privately.
3. Construct the `CodexAgent` and its inbox.
4. Run caller-supplied agent-scope setup while unpublished.
5. Validate native runtime compatibility at the publication boundary.
6. Enter session and agent registries.
7. Announce creation and session start.
8. Start accepting inbox work.

Any failure before publication must unwind:

- native thread/process lease;
- agent-local Cordis scope;
- unpublished session;
- pending listeners and tool registrations.

## First proving scenario

1. Replace the stock `dsh-agent-loop` in a dedicated profile with `dsh-agent-codex`.
2. Create one persistent Codex-backed DSH session.
3. Run several native Codex turns with repository work.
4. Display standard output and at least one Codex-specific event in DSH Web.
5. Use one Crew messaging capability from inside the native Codex environment.
6. Request Crew's existing review pipeline.
7. Interrupt an active turn and verify deterministic settlement.
8. Dispose and cold-resume the agent.
9. Restart DSH and reconnect to the same durable session.
10. Upgrade the Codex CLI protocol baseline and run compatibility checks.
11. Unload the Codex brain plugin and verify lifecycle cleanup.
12. Confirm that no code imports `dsh-agent-loop` internals.

## Comparative evaluation

Use the same meaningful coding tasks under at least three configurations:

```text
A. Native Codex CLI/App Server product behavior
B. Codex App Server through a DSH LlmAdapter and stock DSH loop
C. Codex App Server as a native DSH AgentFactory brain
```

Evaluate more than pass/fail:

- task quality;
- tool-use appropriateness;
- correction behavior;
- number of turns and retries;
- token use;
- wall-clock execution;
- review defects;
- harness-specific failure modes;
- preservation of Crew interoperability.

The key comparison is whether configuration C approaches A's model performance while retaining substantially more of B's ecosystem integration.

## Success criteria

- Codex implements the public DSH Agent/AgentFactory seam without stock-loop internals.
- Native Codex continuation remains authoritative.
- DSH memory, lifecycle, observation, and UI plugins can coexist around the agent.
- Crew messaging and review work without rewriting them as Codex-specific subsystems.
- Restart and cold resume preserve a coherent durable state.
- Unsupported semantic mappings fail explicitly.
- Native Codex performance is materially closer to the product harness than the generic-loop adapter.

## Failure signals

- `CodexAgent` becomes a copy of the DSH loop with App Server used only for inference.
- DSH session projection requires fabricating events that never occurred.
- The browser depends on private CodexAgent fields.
- Tool policy is split between two systems with no inspectable authority.
- Resume silently loses native state.
- Every Codex protocol revision causes changes throughout DSH plugins.
- The implementation requires a permanent DSH core fork.

## Strategic value

A successful result would show that DSH can standardize the body and society around an agent without requiring every model to share one cognitive loop.

That makes DSH a much safer early substrate for a world where Codex, Anthropic, DeepSeek, Kimi, GLM, Meta, and future systems may each perform best under different harness semantics.