# Agentic Sessions: A Writable Continuity Graph

## Status

This is an optional design exploration, not adopted DSH architecture, an active project priority, an upstream API contract, or a required implementation sequence.

LAN access is the current investigation priority.

If a continuity problem later warrants exploration, use this note with the local [working principles](../working-principles.md).

Recheck every proposed seam, storage choice, and semantic claim against current upstream DSH documentation for [architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md), [agent lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/agent-lifecycle.md), [compaction](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/compaction.md), [sessions](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md), and experimental [Agent Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md).

## Thesis

Long-running agent work can lose its active understanding when a model context is compacted, restarted, or handed to another worker.

A transcript is valuable history, but it is not necessarily a useful, current working model of a task.

The idea is to treat a model context as one temporary **epoch** of a durable job.

A small, mutable continuity graph would record the task understanding that a later epoch needs, while an append-only journal retains the evidence and history behind it.

A successor would inherit recorded state rather than claim personal continuity with the previous model context.

This is a hypothesis about a useful workflow boundary, not a claim that DSH sessions are inadequate or that every long task needs another state store.

## Proposed State Surfaces and Ownership

The design distinguishes surfaces that otherwise tend to be conflated:

- **Job:** the durable user objective, constraints, and current outcome.
- **Epoch:** one bounded model context doing work on that job.
- **Journal:** immutable history of messages, tools, events, and evidence.
- **Continuity graph:** a revisable foreground model of decisions, active questions, dependencies, next actions, and the provenance of each claim.
- **Preparation packet:** selected graph material supplied to a successor; it is not the complete graph or the journal.
- **Seal:** a deliberately recorded handoff stating what is known, uncertain, pending, or not rechecked.

The journal keeps the historical trail available without making every historical detail foreground context.

The graph would be working state, not ground truth.

Repository state, task systems, durable DSH session records, and user-authored constraints retain their own authority.

A recorded claim should say whether it is observed, inferred, inherited, superseded, or unknown.

That distinction lets a successor decide what needs checking instead of treating a predecessor's summary as a fact.

### Ownership and concurrency

One worker may draft working-state changes while it investigates, but a draft is not automatically shared team understanding.

Concurrent workers should not silently overwrite a shared conceptual conclusion just because they touched the same broad subject.

A useful boundary would keep private exploration separate from a deliberately reviewed fold into shared state.

Any accepted conclusion should retain a path back to relevant reports, session events, repository evidence, or user direction.

This is an epistemic ownership rule, not a proposal to add a general-purpose distributed database.

## Relationship to Current DSH

DSH already has an append-only [Session](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md) log, current [agent lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/agent-lifecycle.md) behavior, and optional [compaction](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/compaction.md).

This idea must coexist with those current semantics rather than assume it replaces them.

In particular, no model-visible continuity material should bypass the Session model without an explicitly supported current extension point.

The existing Session log remains the durable account of what DSH records; this sketch does not establish a second authoritative transcript.

Experimental [Agent Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md) already exposes the opt-in `ctx.agentTeams` coordination domain.

It owns a durable roster, peer mailbox, shared task DAG, and continuable-child lifecycle.

A continuity graph, if useful, would add semantic working state above those records.

It should link to Team tasks and messages, not duplicate their task ownership, delivery, or lifecycle rules.

The exact hooks, event boundaries, persistence shape, and model-facing behavior are intentionally unspecified here.

DSH is moving quickly, so they are questions for the current source at the time of any prototype, not commitments made by this note.

## Possible Exploratory Slice

Only after a real observed continuity failure justifies it, the smallest useful experiment could be an explicitly opt-in, file-backed record for one local task.

It would let a worker record a few topic-oriented claims and next actions.

It would deliberately start one fresh successor without replaying the predecessor transcript.

It would compare the successor's first useful action with the ordinary session baseline.

It intentionally would not choose a production storage engine, a new protocol, or a general multi-agent merge model.

Those choices would be premature until the narrow observation says that the basic distinction is valuable.

The observation is whether the successor can continue honestly.

It should find the next action, distinguish evidence from inherited assumptions, and retrieve supporting history when needed.

This would be evidence about the idea, not a release gate or replacement for ordinary compaction.

It would not justify sidebands, background recovery, multi-agent merging, or a general storage subsystem by itself.

## Decisive Open Questions

1. Is there a recurring user-visible or operator-visible failure that the existing Session, compaction, and handoff mechanisms do not already address?
2. Which facts need durable semantic working state, and which should remain in the session log, repository, task board, or ordinary documentation?
3. Can a successor become useful with a small packet while retaining access to exact source evidence when it matters?
4. How should user constraints and repository truth outrank stale or model-authored continuity entries?
5. What is the smallest reviewable ownership boundary between one worker's private notes and shared team understanding?
6. Which current DSH extension points can support the experiment without changing Session or Agent Teams authority?
7. What operational benefit would justify maintaining another durable state surface?

## Non-Goals

- Preserving hidden model activations or claiming persistent model identity.
- Replacing DSH sessions, task systems, repositories, or user documentation.
- Declaring a mandatory compaction, handoff, security, validation, or review process.
- Treating a continuity entry as verified merely because an earlier worker recorded it.
