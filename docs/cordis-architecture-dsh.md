# Cordis in DSH: a local mental model

This is a project interpretation, not a copy of DSH's API reference. DSH moves quickly; its `master` documentation owns exact package names, event names, signatures, and configuration facts. Start with the upstream [architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md), then use its [Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md) or [tutorial](https://github.com/deepseek-ai/deepseek-harness/tree/master/docs/cordis-tutorial) when implementing a plugin.

## The model

DSH is a Cordis composition: plugins contribute services, typed events, and reversible registrations to a context. Context selects capabilities by key; fibers give each mounted plugin a lifetime; effects attach registrations to that lifetime. A listener, provider, timer, or registry entry is therefore not global residue: unloading its owner must remove it.

Treat a capability as a complete **Definition / Provider / Consumer** seam. The definition names the interface and vocabulary, a provider implements it, and a consumer uses it. A registry or broker belongs at the seam when several providers genuinely coexist; competing claims to one service key do not. This is the important local test for a "replaceable" feature: can its provider change without teaching its consumers provider-specific behavior? The upstream [capability-seam graph](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/capability-seams.md) and [core subsystem reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md) define the live terms.

Events are similarly semantic, not generic callbacks. Use a broadcast mode for independent observation, an ordered/claiming mode only when one participant really decides, and a waterfall for an around-operation decision. Waterfall listeners delegate with `next()`; returning without it deliberately replaces or vetoes what follows. The [primer's dispatch rules](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md#dispatch-modes) and generated [producer/consumer catalog](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/event-producer-consumer.md) are authoritative.

## State, scope, and authority

An Agent is live execution: its inbox, status, context, and cancellation behavior exist while its factory activation owns them. A Session is durable evidence: an append-only event log from which history, replay, and projections derive. Do not confuse a live Agent with a Session that can later be resumed. The upstream [agent lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/agent-lifecycle.md), [core](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md), and [session](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md) pages own those guarantees.

`agent.ctx` and scoped registration decide visibility and lifetime inside an agent's composition. They do not grant authorization. Keep the subject, owner, and permission decision explicit across process, persistence, and wire boundaries; see the upstream [scope reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/scope.md).

Model-visible means logged. If a plugin changes what reaches a model, the session log must contain enough information to reconstruct that input. Live events can observe or intercept an active run; durable session events preserve facts across reload, replay, UI projection, and resume. This rules out an authoritative memory or prompt mutation that exists only in process memory.

Memory belongs here as an external or experimental capability: it may select and inject context, index logged facts, or offer tools, but it is not an official DSH memory subsystem or a promise that every brain has identical memory semantics.

## Where extensions belong

Prefer DSH's documented public extension points over loop edits or private fields: services for direct capability calls, events for observation and policy, session events for durable facts, registries for intentional multiplicity, and scopes for per-agent composition. The upstream [extension cookbook](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md) is the implementation map; [bundle and profile publishing](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md) explains how a composition is installed and overlaid.

For coordination, inspect [experimental Agent Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md) first. It is the current DSH seam for a durable roster, mailbox, and task graph over subagents. Use the [subagent reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md) for one-shot and continuable child semantics before designing another coordinator.

## Review questions

- Does each registration have the same owner and lifetime as the context where it is visible?
- Is the event mode the relationship requires, rather than a convenient listener order?
- Does a new capability include its Definition, Provider, and Consumer roles?
- Is agent-specific work scoped to that agent, while authority remains explicit?
- Is every model-visible or resume-relevant fact represented durably?
- Does the change use a public extension point and leave generic packages free of provider branches?

Topology smells are useful early warnings: many `prepend` listeners, a generic package importing a concrete provider, a global registration standing in for an agent-local one, duplicate cleanup paths, or a single event mixing observation, policy, mutation, and ownership. The catalogs make such edges inspectable; they do not replace judgment.

Local experiments should also follow the project's [working principles](working-principles.md).
