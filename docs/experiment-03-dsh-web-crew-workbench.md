# Experiment 03: DSH Web as a Crew Workbench

Follow the shared [working principles](working-principles.md). Consult the current DSH [architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md), [Cordis primer](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cordis-primer.md), and [plugin publishing guide](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.md). [Experimental Agent Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md) may already provide roster, mailbox, and task coordination, so compose or extend it before Crew recreates them.

## Purpose

Evaluate whether DSH's client-side Cordis application can become the deep conversation workbench for DSH-backed Crew agents while Rusty View remains the cross-runtime fleet and operations surface.

This is not a replacement decree. It gives each interface a job it can earn:

```text
Rusty View                         DSH Web
fleet and system control           deep work on DSH-backed sessions
all runtime and legacy access      conversation and tool presentation
review administration              Crew-specific workbench contributions
```

## Hypothesis

Crew should own the organizational semantics that make a workbench useful—identity, task, messaging, delegation, and review—not generic chat rendering, streaming projection, reconnection, history handling, tool trees, or browser-plugin lifecycle.

If public DSH composition can carry those semantics cleanly, Rusty View can remain smaller and focused. If it cannot, keeping Rusty View is a valid outcome rather than a reason to fork DSH Web.

## Decision and ownership

Keep the stock DSH workbench intact and add Crew value through host and client plugins, public services, events, and slots. The browser receives plain Crew contract data through the DSH host; it neither reaches the Rust implementation directly nor manipulates DSH conversation internals.

```text
Crew services
  identity / tasks / messages / review / catalog
             │
             ▼
DSH host Crew plugins ── DSH Web transport ── DSH client Crew plugins
                                                    │
                                                    ▼
                                           Crew workbench contributions
```

| Concern | Authority |
|---|---|
| DSH-backed session event log and conversation rendering | DSH |
| Crew identity, organization, task, messaging, and review state | Rusty Crew |
| Exact-SHA review ticket and CI result identity | Rusty Crew |
| Browser display of both authorities | Derived client projection |
| Fleet controls and legacy-session access | Rusty View |

Do not place Crew workflow state into synthetic DSH transcript events merely for display. The workbench may join the two projections, but it keeps their origin visible.

## Contribution shape

The host plugin translates Crew domain data into the DSH-facing contract; client plugins render that contract in the declared workbench surfaces. A Crew contribution owns its own identity, task, message, or review presentation without taking ownership of DSH's generic conversation state.

This leaves room for a different Crew layout only if the product demands it. Reproducing Rusty View's appearance is not enough reason to replace a DSH layout seat.

## Public composition boundary

Crew may add a typed host connection, client services, tool cards, details panels, navigation, or a declared UI-seat replacement through documented extension points. It may propose a small domain-neutral upstream seam when one is genuinely missing.

Crew must not import DSH package internals, patch conversation/session/connection machinery, or maintain a private source patch stack. Work against the current checkout and the current `crew-dsh` profile; client features depend on Crew contracts and documented DSH surfaces, not transient internal stores.

Agent Teams is the first place to look for generic delegation, roster, mailbox, and task behavior. A Crew-specific browser or host service exists only when the product slice requires a Crew meaning that the DSH seam does not carry.

## Minimum credible product slice

One DSH-backed Crew agent opens in stock DSH Web through the current `crew-dsh` profile. The workbench shows its Crew identity and current task, sends one Crew message, and renders a Crew review request as a native contribution. The same session receives asynchronous review or CI progress with Crew's exact-SHA review identity intact.

Rusty View continues to list and operate across native Crew, Codex, and DSH-backed sessions, and links this DSH-backed agent into the workbench. The slice is complete only when the host/client contributions are actually wired into this path; a mock panel, a general UI tour, or a second full fleet UI is not enough.

The claimed session behavior must be observable in the product path, including the returned review state. Unsupported cross-runtime transcript projection remains plainly unsupported rather than being approximated by a second transcript authority.

## Supported limits and outcomes

The first workbench supports deep work on DSH-backed sessions, not immediate display of every native Crew or Codex transcript. It does not promise a wholesale Rusty View migration, a generic rewrite of Crew review, or a separate Crew implementation of Agent Teams.

If the public plugin surface can carry the message, task, review, and durable session relationships without reaching into DSH internals, the workbench has earned wider use. If it cannot, document the missing seam and retain Rusty View and the host-side DSH experiment as complementary paths. That negative result is product evidence, not a failure to be hidden by framework ceremony.
