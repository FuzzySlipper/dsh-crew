# Experiment 04: Per-Agent Swappable Brain Broker

## Purpose

Extend DSH's deployment-level loop replacement into true per-agent brain selection.

DSH currently separates the public `Agent` interface and registry from the concrete stock loop, which is a strong architectural seam. The current registry, however, accepts one `AgentFactory` at a time. That supports replacing the loop for an entire composition, but not yet a mixed population such as:

```text
Alice   → stock DSH loop
Bob     → native Codex App Server
Carol   → future GLM-native harness
Dave    → Rusty Crew Responses brain
```

Rusty Crew's swappable-brain concept is aimed at this per-agent heterogeneity.

## Main hypothesis

A stable `AgentFactoryBroker` can preserve DSH's public agent/session/plugin contracts while routing creation and resume to named brain providers.

This should use the Cordis service-broker pattern rather than place model-specific branching throughout the agent registry, UI, session store, or orchestration plugins.

## Proposed topology

```text
consumers
  UI / teams / Crew bridge / ACP / configuration
                    │
                    ▼
              ctx.agents
                    │
                    ▼
          AgentFactoryBroker
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
   dsh-loop       codex      crew-responses
   provider       provider       provider
```

The broker remains the single factory registered with `ctx.agents`. Brain implementations register behind it through a separate service.

## Terminology

### Agent

The runtime-neutral public actor exposed to DSH plugins:

```text
id / session / inbox / status / ctx
send / followup / steer / inject
cancel / whenIdle / runMaintenance
```

### Brain provider

A component capable of creating and resuming one concrete `Agent` implementation.

### Brain route

The stable name used to select a provider, for example:

```text
dsh
codex-app-server
crew-responses
future-glm-native
```

### Broker

The one `AgentFactory` visible to `ctx.agents`. It resolves a route, delegates creation/resume, and preserves ownership and rollback contracts.

## Proposed public seam

A provisional service could look conceptually like:

```ts
interface BrainProvider {
  readonly id: string
  create(ownerCtx: Context, options: CreateAgentOptions): Promise<AgentHandle>
  resume(ownerCtx: Context, options: ResumeAgentOptions): Promise<AgentHandle>
  describe?(): BrainDescriptor
}

interface BrainRegistry {
  register(provider: BrainProvider): () => void
  get(id: string): BrainProvider | undefined
  list(): BrainDescriptor[]
}
```

`AgentOptions` can be declaration-merged with route selection:

```ts
interface AgentOptions {
  brain?: string
}
```

The broker selects:

1. explicit per-agent `brain`;
2. preset or scoped default;
3. deployment default;
4. otherwise a clear configuration error.

The final selection should be recorded durably where it is needed for resume and diagnostics.

## Why a broker instead of multiple factories

The public agent registry should not become aware of every model-native implementation.

A broker keeps the stable boundary:

```text
ctx.agents.create(...)
ctx.agents.resume(...)
```

Consumers do not need to know whether the resulting agent is stock DSH, Codex, or a Crew brain.

Provider registration is lifecycle-owned. Unloading a provider removes it from future selection while existing handles follow an explicit policy.

## Provider unload policy

This needs a deliberate contract. Plausible choices include:

### Strict structural ownership

Unloading a brain provider drains and disposes every live agent it created.

Advantages:

- simple ownership;
- no agent outlives the implementation surface it depends on.

### Quiescent migration

The broker stops new creation, waits for agents to become idle, persists them, disposes old activations, and resumes them through a replacement provider where compatible.

Advantages:

- supports rolling brain upgrades.

Costs:

- requires explicit state compatibility and migration semantics.

### Fixed provider binding per activation

Existing agents retain the exact provider registration until disposal; only new activations use the replacement.

Advantages:

- avoids mid-activation semantic migration.

Costs:

- provider plugin unload may need to wait for long-lived agents.

The initial implementation should use strict structural ownership or fixed binding. Automatic cross-brain migration is a later experiment.

## Creation and resume contract

The broker must preserve DSH's transactional publication semantics.

```text
caller requests create/resume
  ↓
broker resolves exact provider registration
  ↓
provider privately prepares session + agent + scope
  ↓
optional setup completes while unpublished
  ↓
provider publishes and returns AgentHandle
```

Provider selection must remain fixed across the asynchronous operation. A route replacement during preparation must not cause one provider to validate the request and another to publish it.

A failed provider operation must roll back its private resources and leave no partial registry entry.

## Durable brain identity

Resume needs to distinguish several cases:

```text
same brain implementation and compatible version
  resume normally

same brain route, upgraded compatible implementation
  run provider-owned migration or compatibility check

different brain requested intentionally
  explicit brain transfer workflow

original brain unavailable
  keep session inspectable and report unavailable route
```

Suggested durable metadata:

```text
brain route
provider implementation/version fingerprint
brain-specific replay/checkpoint state
configuration digest
last compatible session-format version
```

Do not infer the brain from provider/model strings. One brain may support many providers, and several brains may support the same model.

## Relationship to DSH LLM providers

Keep two axes independent:

```text
brain
  stock-dsh-loop
  native-codex
  crew-responses

model route
  deepseek/v4
  openai/codex-model
  kimi/...
  local/...
```

The stock DSH brain normally uses `ctx.llm` and can switch provider/model routes.

A native Codex brain may own its provider and model selection through App Server.

A Crew Responses brain may use Crew's existing provider machinery.

The broker selects cognitive machinery. It should not force every brain through the same LLM seam.

## Preset and scope interaction

Brain selection should compose with agent presets without turning presets into model-specific monoliths.

Possible split:

```text
agent preset
  tools
  prompt/persona
  memory/skills
  Crew capabilities
  default brain route

brain provider
  concrete driver semantics
  accepted options
  native checkpoint state
```

A brain may reject preset capabilities it cannot honor. Rejection should happen before publication and identify the unsupported contract.

## Capability description

Brain providers should advertise structured capabilities for admission and UI:

```text
supports resume
supports steering
supports non-waking injection
supports native tools
supports DSH tools
supports structured output
supports image input/output
supports native reasoning projection
supports per-session model selection
supports cold migration
```

Treat this as evidence for compatibility checks, not as a giant universal lowest-common-denominator API.

A consumer asking for a required capability should fail before work begins when the selected brain lacks it.

## UI implications

The browser should present brain identity separately from provider/model identity:

```text
Brain: Codex App Server
Model: gpt-...
Runtime: Crew-managed App Server
```

or:

```text
Brain: DSH stock loop
Provider: DeepSeek
Model: deepseek-v4-pro
```

Generic controls should appear only where their semantics are supported. For example, a brain lacking true steering should not display a steering action that silently becomes a follow-up.

## Minimum credible implementation

1. Introduce a broker service behind the existing `ctx.agents` factory slot.
2. Register the stock DSH loop as one named brain provider without changing its public `Agent` result.
3. Register a minimal second test brain or the Codex AgentFactory from Experiment 02.
4. Create two agents with different brain routes in one DSH process.
5. Verify ordinary UI, session, team, and Crew plugins treat both as Agents.
6. Restart and resume both through their original routes.
7. Remove one provider and verify new creation fails clearly while the other route remains healthy.
8. Replace one provider implementation and verify selection uses exact registration snapshots.
9. Export brain provider/consumer topology.
10. Confirm provider-specific branches do not appear in the AgentRegistry or unrelated plugins.

## Upstream strategy

This seam is likely useful beyond Crew. If implementation requires changing DSH, prefer a small domain-neutral upstream proposal:

```text
before
  AgentRegistry owns one AgentFactory slot

after
  AgentRegistry still owns one factory contract
  a standard broker plugin can own the slot
  concrete loop implementations register as brain providers
```

Avoid making `brain` a Crew-specific concept in DSH core if a more neutral term such as `agent driver` or `agent implementation` fits upstream vocabulary better.

## Success criteria

- Stock DSH and native Codex agents coexist in one runtime.
- Generic DSH plugins depend only on the public Agent/session contracts.
- Brain selection is explicit, durable, and inspectable.
- Brain providers are lifecycle-owned and unload cleanly.
- Provider/model selection remains independent from brain selection.
- Unsupported semantics fail at admission rather than being approximated silently.
- The broker is small and does not become a new God orchestrator.

## Failure signals

- The broker begins implementing turn logic itself.
- Every consumer branches on `agent.options.brain`.
- Brain-specific events leak into unrelated package contracts without namespacing.
- Resume guesses a provider from current configuration rather than durable metadata.
- The stock loop cannot register behind the broker without invasive changes.
- Mixed brains require separate agent registries or separate browser applications.
- Capability negotiation grows into a fake universal harness that erases the native distinctions the design exists to preserve.

## Strategic value

This experiment would turn DSH from a provider-agnostic harness into a **brain-plural runtime**.

That is a stronger and more future-proof claim. It allows the wider infrastructure to remain shared while model-specific harness engineering continues independently wherever it materially affects performance.