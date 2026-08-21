# Experiment 01: Rusty Crew ↔ DSH Sidecar

Follow the shared [working principles](working-principles.md). DSH composition facts come from the current [architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md) and [Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md). Current experimental [Agent Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md) already supplies roster, mailbox, and task coordination; compose or extend it before introducing a Crew equivalent.

## Purpose

Find out whether a DSH-backed agent can be a real Crew citizen while each system keeps the responsibility that makes it valuable. The first deployment resembles Crew's existing external-runtime lane: Crew supervises a `crew-dsh` sidecar and projects it through Crew services and UI. Unlike an opaque product session, the sidecar is a DSH/Cordis application that can absorb generic harness work as the experiment earns that move.

The intended direction is reversible:

```text
initially                         later, if earned

Rusty Crew                        crew-dsh Cordis application
  supervises a sidecar              runs DSH agents and plugins
                                    consumes selected Crew services
```

The bridge must not prevent that inversion, but the experiment does not assume it will happen.

## Hypothesis

Crew can retain durable organization, governance, and selected Rust authorities while DSH owns generic execution, providers, skills, session runtime, and workbench machinery. A memory capability is external or future until a chosen profile actually provides it.

The useful result is a smaller generic Crew surface, not a second implementation of DSH inside Crew.

## Decision and authority split

Use a narrow duplex bridge built from public DSH plugins and services. Do not copy the DSH Web transport as Crew's runtime contract, import DSH internals, or carry a private DSH patch stack. The bridge carries only the product behavior needed by the slice and remains free to change with the current checkout.

| Durable concern | Initial authority |
|---|---|
| Crew agent identity, role, organization, and task meaning | Rusty Crew |
| Crew messaging and cross-runtime catalog | Rusty Crew |
| Review ticket, GitHub/CI state, and exact-SHA review identity | Rusty Crew |
| DSH session log and live DSH activation | DSH |
| Providers, tools, skills, and loop composition | DSH |
| Memory capability | Explicit external or future profile choice |
| Rusty View representation | Derived projection |

Crew does not become the owner of a generic DSH session just because it launches the process. DSH does not become the owner of Crew organization or review governance just because an agent can call a Crew capability.

## Bridge shape

The `crew-dsh` profile composes the bridge beside ordinary DSH plugins. It exposes a small runtime-facing service to Crew and narrow Crew-domain services to the DSH agent, so a message or review tool depends only on the Crew meaning it uses.

This keeps the sidecar legible without prescribing a permanent wire grammar. The active profile and its contributions may change with DSH; durable session and Crew review meanings may not silently change with them.

The bridge records enough provenance for a user to understand which runtime produced a visible result, not a second authority for that result.

## Durable events and live activity

The sidecar has one critical boundary: durable session facts are replayable, while live activity is only presentation. A reconnect recovers missed durable session events before continuing live delivery; an activity or status update cannot repair a transcript.

Likewise, a connection does not own a session's lifetime. A cold-resumed DSH agent is a new live activation over the same durable work. Dehydrating an activation retains the session; deleting a session is a different, explicitly unsupported operation until the product needs it.

## Minimum credible product slice

The slice is complete when one Crew-selected session can run in the current `crew-dsh` profile, receive a durable message from a Crew agent, and expose one Crew capability through DSH. The agent must request Crew's existing exact-SHA review flow and receive its asynchronous result in the same durable session after a restart or bridge reconnect.

Rusty View should show that session as a DSH-backed Crew agent and link to its workbench when one exists. A stock DSH skill may participate unchanged. Any memory capability must be named as external or future rather than implied to be a current DSH subsystem.

A prompt round trip, a live-only status display, or a duplicated transcript is not this product slice.

The slice does not need an exhaustive recovery demonstration. It does need the actual restart or reconnect path it claims to support, including the durable result that the agent and the human can observe afterward.

## Boundaries and useful outcomes

Crew-facing tools depend on narrow Crew domains, not one unbounded escape hatch. Agent Teams should carry generic delegation, roster, mailbox, or task behavior when it fits; a Crew service is added only for a Crew-specific meaning the DSH seam cannot represent.

The experiment deliberately does not promise a universal Crew runtime, a DSH replacement for Crew review governance, or migration of every legacy session into DSH. If public composition cannot carry the message, durable recovery, or review relationship without upstream patches or competing authorities, that is a valuable negative result. Record the missing boundary and keep Rusty Crew's existing path intact.
