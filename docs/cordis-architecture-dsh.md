# Cordis Architecture in DeepSeek Harness

## Architectural premise

DeepSeek Harness, or DSH, is built as a Cordis application in which nearly every major subsystem is a plugin:

- agent loop
- agent registry
- session log
- session persistence
- system-prompt assembly
- tool registry and execution pipeline
- model adapters
- sandbox, filesystem, and subprocess providers
- skills, memory, compaction, goals, policies, and UI integration

There is intentionally no privileged application core that every extension must patch. Features are composed by mounting plugins beside existing plugins, and concrete implementations are selected through configuration. 

This architecture applies the paper's two central ideas:

- **Revertible effects:** plugin registrations belong to plugin lifecycles and unwind when the plugin unloads.
- **Reactive coeffects:** plugins declare required services and activate only while those services are available.

## 1. Context as the composition plane

Cordis exposes shared capabilities through stable context keys:

```ts
ctx.sessions
ctx.tools
ctx.llm
ctx.agents
ctx.agentLoop
```

A plugin declares the services it requires:

```ts
export const inject = ['sessions', 'tools']

export function apply(ctx: Context) {
  // ctx.sessions and ctx.tools are available here
}
```

The plugin does not need to import the concrete implementation of those services.

A service provider claims one `ctx.<key>` in its current isolation realm. Another plugin attempting to provide the same key in the same realm is rejected rather than silently replacing the first provider. 

This creates three common patterns:

```text
One implementation:
    one service provider owns ctx.foo

Several implementations:
    one broker/registry service owns ctx.foo
    named providers register inside it

Context-specific implementation:
    isolate ctx.foo into separate realms
```

## 2. Plugins are lifecycle-owned fibers

Each mounted plugin has a Cordis **fiber** representing its runtime lifecycle.

The fiber owns:

- services the plugin provides
- event listeners it registers
- effects it performs
- child plugins or scopes it creates
- accumulated cleanup operations
- dependency state
- activation and unloading progress

A plugin waits until all declared injections are available. If a required service disappears or changes, Cordis unloads and later reloads the dependent plugin against the new dependency state. 

The practical consequence is:

> A registration is not merely added to a global table. It is added on behalf of a specific plugin lifetime.

## 3. Registrations are effects

Cordis treats registrations as reversible effects.

```ts
ctx.effect(() => {
  const handle = registry.register(value)

  return () => {
    registry.unregister(handle)
  }
})
```

Common Cordis helpers already use this model:

```ts
ctx.on('event/name', listener)
ctx.provide('serviceName', service)
ctx.plugin(childPlugin)
```

`ctx.on()` records the listener against the current fiber. When that fiber unloads, the listener is automatically removed.  

This prevents reload residue such as:

```text
plugin v1 listener remains registered
plugin v2 listener is added
both now respond
```

Every reusable registry in DSH should therefore follow the same convention:

```text
register(...) -> disposer
```

and the registration should be installed through the owning context.

## 4. Capability seams

DSH organizes major functionality as **capability seams** with three roles:

1. **Service Definition:** declares the interface and shared vocabulary.
2. **Service Provider:** implements that interface.
3. **Consumer:** uses the service, often through a model-facing tool or another service.

For example:

```text
Subagent Service Definition
    ctx.subagents and provider contracts

Subagent Providers
    in-process
    forked process
    ACP
    Codex
    other harnesses

Consumers
    delegation tools
    control tools
    reporting tools
```

This is preferable to letting each provider leak special cases into the loop or UI.

A capability seam should be complete enough that replacing a provider does not require changing its consumers.

## 5. The agent loop is a provider, not the architecture

DSH's concrete agent loop is itself a plugin implementing an agent-factory/driver service.

Other subsystems do not need to be compiled directly into the loop. Instead, they interact through services, durable session events, and typed live events.

The loop exposes extension points around activities such as:

```text
agent creation
session start
inbox insertion and claim
pre-step admission
request selection
request failure
tool execution
turn stopping
agent disposal
```

This makes features such as memory, skills, compaction, goals, retries, contextual instructions, telemetry, and subagent behavior independently replaceable or combinable.

A sophisticated memory plugin might:

```text
observe session/event
maintain a memory index
listen at agent/pre-step
inject selected memories
register optional memory tools
```

It does not need provider-specific conditionals or private hooks inside the loop.

The DSH architecture explicitly directs new behavior toward documented extension points rather than casually modifying the loop. 

## 6. Event modes are part of the contract

Cordis does not reduce every interaction to a generic callback.

An event declares a dispatch mode that defines how multiple listeners coexist:

| Mode | Intended use | Conflict behavior |
|---|---|---|
| `emit` | synchronous observation | all listeners run; return values ignored |
| `parallel` | awaited independent observation | all listeners run concurrently |
| `serial` | ordered claim or awaited coordination | first meaningful return may stop dispatch |
| `bail` | synchronous claim | first meaningful return stops dispatch |
| `waterfall` | interception and around-middleware | listeners wrap or replace downstream behavior |



The mode should reflect the actual semantic relationship among listeners.

### Broadcast

Use `emit` or `parallel` when listeners should coexist without competing over a result:

```text
session/event
agent/status
agent/created
```

Typical consumers include persistence, telemetry, indexing, UI projection, and diagnostics.

### Claim

Use `serial` or `bail` when the contract genuinely means:

```text
Can any registered participant handle this?
```

This is intentionally order-sensitive. It should not be used casually for concerns that should combine.

### Waterfall

Use `waterfall` for middleware-like interception:

```ts
ctx.on('agent/pre-step', async (payload, next) => {
  const decision = await next()
  return adjust(decision)
})
```

A waterfall listener must call `next()` to delegate. Returning without calling `next()` is an intentional veto or replacement of all downstream behavior. 

Excessive use of `prepend: true` or undocumented listener-order assumptions is an architectural smell. It usually indicates that multiple plugins are making incompatible claims over one seam.

## 7. Resolve collisions according to their kind

When several plugins touch the same concern, first classify the relationship.

### Everyone should observe

Use a broadcast event.

```text
one fact
many independent observers
```

### Everyone contributes

Use a domain registry or collection service.

```text
many tool definitions
many model adapters
many subagent providers
many prompt sections
```

The registry owns duplicate-name policy, ordering, scoping, and diagnostics.

### Exactly one provider should exist

Use a single Cordis service key.

A second provider in the same realm should fail loudly.

### Different contexts need different providers

Use service isolation or agent scopes.

```text
Agent A -> tool realm A
Agent B -> tool realm B
```

### Concerns wrap one operation

Use a waterfall with a documented decision type.

### One policy must never weaken another

Prefer a monotonic representation.

For example, DSH tool guards can deny a call or express no opinion. They cannot return an overriding allow result, so a later plugin cannot undo an earlier denial merely because it ran later. 

This is preferable to resolving security policy through arbitrary numeric listener priority.

## 8. Isolation and agent scopes

Cordis `isolate()` allows the same service name to resolve through different realms in different child contexts:

```ts
const isolated = ctx.isolate('tools')
```

A service provided under one realm does not collide with a service using the same logical key under another realm. 

DSH adds a scope system used for per-agent and per-preset composition.

A scope determines both:

- **Visibility:** which scoped registrations an agent can see.
- **Ownership:** which lifecycle disposes those registrations.

Scope keys may form a parent chain. A child agent can inherit registrations from its preset or parent composition while adding nearer, agent-specific layers. Scoped event routing admits listeners associated with the relevant scope or its ancestors. 

The key rule is:

> Registration visibility and registration ownership must derive from the same context.

Avoid creating an agent-local registration owned by an unrelated global lifecycle.

Scopes are routing and lifecycle mechanisms, not security sandboxes.

## 9. Durable sessions are separate from live execution

DSH sessions are append-only logs of typed events.

The event log is the source of truth for:

- user messages
- assistant output
- tool calls and results
- turns and steps
- request configuration
- plugin-defined durable state

Model history is derived from the log rather than stored as a second authoritative representation. 

Session persistence is a separate capability seam with interchangeable backends. It supports preparation, loading, inspection, append, flushing, crash recovery, and resuming a stored session into a newly created live agent. 

A major DSH invariant is:

> Model-visible means logged.

A plugin that changes what the model sees must make that change reconstructable from durable session state. Ephemeral mutation of request history is not sufficient.

## 10. Inspectable topology

DSH generates a producer/consumer matrix for harness-owned events.

For each event, the matrix records:

- event name
- dispatch mode
- declaring package
- dispatching packages
- listening packages



This turns event topology into reviewable data.

A drift checker can flag changes such as:

```text
agent/pre-step gained seven consumers
three new listeners use prepend
one package now listens to both provider and UI events
a previously observational event became a waterfall
a service gained a cross-domain consumer
```

The checker does not need to understand the whole architecture. It only needs to identify topology changes associated with known risk patterns.

DSH applies the same approach to generated service APIs, event signatures, configuration catalogs, persistence event catalogs, module graphs, and other architectural projections.

## 11. Practical plugin-authoring rules

When adding behavior, decide which architectural form it actually has.

### Use a service method when

- one plugin directly needs a capability from another
- the call has a clear owner and result
- the consumer should not know the concrete provider
- the interaction is not naturally broadcast

### Use an event when

- a fact has independent observers
- policy must intercept a standard operation
- middleware must wrap a standard operation
- live activity needs observation without direct imports

### Use a session event when

- the fact must survive reload or restart
- it affects model-visible history
- replay must reconstruct it
- projections, indexing, or UI should derive from it

### Use a registry when

- several named providers or contributions legitimately coexist
- multiplicity is part of the domain rather than an accident
- duplicate handling, ordering, or discovery needs one owner

### Use isolation or scopes when

- different agents, presets, tenants, or contexts need different instances
- a registration should be visible only within a particular composition
- lifecycle ownership must follow that composition

## 12. Review checklist

Before accepting a new plugin or extension:

1. Does it depend on abstract services rather than concrete provider packages?
2. Are all registrations installed as owned effects?
3. Does every registry insertion return an exact disposer?
4. Is the event dispatch mode appropriate to the relationship?
5. Does a waterfall observer always call `next()`?
6. Is listener ordering semantically required or merely convenient?
7. Is a multiple-provider problem represented by a registry rather than competing service claims?
8. Is agent-specific behavior mounted in an agent scope rather than globally?
9. Are security restrictions monotonic where possible?
10. Is model-visible behavior reconstructable from the session log?
11. Can the event and service topology be inspected after the change?
12. Did the change introduce new cross-domain edges or provider-specific branches in generic code?
13. Can the plugin unload without leaving timers, listeners, registrations, or background work behind?
14. Can one provider be replaced without modifying its consumers?

## 13. Architectural smells

Common warning signs include:

```text
many plugins request prepend
generic packages import concrete providers
provider names appear inside the agent loop
platform-specific formatting leaks into domain services
agent-specific listeners are registered globally
the same service key is conditionally overwritten
cleanup is maintained separately from registration
model-visible state exists only in memory
one event mixes observation, mutation, policy, and ownership
a plugin listens to numerous unrelated subsystem events
```

Cordis does not prevent every bad design. Its value is that dependencies, lifetimes, scopes, event modes, and provider relationships become explicit enough to inspect, constrain, and review.

## Working mental model

```text
Plugin
  injects abstract services
  provides zero or more capabilities
  installs owned reversible registrations
  listens through typed event contracts
  runs only while its dependencies are satisfied
  unloads without leaving residue

Context
  resolves providers
  controls scope and isolation
  attributes effects to plugin lifetimes
  exposes service and event topology

Session
  stores durable facts

Agent
  is a live execution using one composed context

Agent loop
  is one replaceable provider that drives the execution protocol
```

The architectural goal is not merely to make features installable. It is to make independently evolving features coexist without forcing each feature to understand the entire harness.