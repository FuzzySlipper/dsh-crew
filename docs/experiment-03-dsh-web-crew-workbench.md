# Experiment 03: DSH Web as a Crew Workbench

## Purpose

Evaluate whether DSH's client-side Cordis application can replace the generic conversation-workbench responsibilities currently owned by Rusty View while Crew retains the organizational semantics that make the environment useful.

The experiment should not begin by replacing Rusty View. It should let the two interfaces specialize:

```text
Rusty View
  fleet and system control
  native Crew / Codex / DSH runtime overview
  provider and service health
  review administration
  compatibility access to existing sessions

DSH Web
  deep workbench for DSH-backed sessions
  conversation and tool presentation
  Crew identity, task, message, and review plugins
```

If DSH Web earns more responsibility, Rusty View can shrink naturally rather than being discarded by decree.

## Main hypothesis

DSH Web's plugin architecture can carry Crew-specific work surfaces without requiring Crew to own generic chat rendering, streaming projection, reconnection, large-history behavior, tool trees, model selectors, or browser plugin lifecycle.

The desired result is:

> Own the semantics that make the workbench Crew, not the machinery that makes it a workbench.

## Why this matters

Rusty View has grown into a substantial product because a serious agent UI must handle much more than chat bubbles:

- streaming and partial result reconciliation;
- huge and irregular histories;
- tool-call trees and rich result presentation;
- reconnect and missed-update recovery;
- multiple runtime types;
- session navigation and status;
- settings, providers, health, and administration;
- themes, layouts, and plugin surfaces;
- background work, queues, steering, and cancellation.

Even a modular implementation leaves Crew responsible for maintaining all of that substrate.

DSH Web already treats the browser as a Cordis application. Host-selected client plugins are dynamically loaded, dependencies and lifecycle are governed through Cordis, and UI contributions are mediated through services and slots rather than direct cross-plugin component imports.

## Proposed topology

```text
Rusty Crew services
  agents / tasks / messages / review / catalog
                │
                ▼
DSH host Crew bridge plugins
                │
         existing DSH web transport
                │
                ▼
DSH client Crew services
  ctx.crewAgents
  ctx.crewTasks
  ctx.crewMessages
  ctx.crewReviews
  ctx.crewCatalog
                │
                ▼
Crew client UI plugins
```

The browser should receive plain contract data. It should not know the Rust service implementation or reach around the host plugin into Crew directly.

## Compatibility rule

Distinguish intended composition from accidental forking:

| Change | Interpretation |
|---|---|
| Add a Crew client plugin through public services and slots | Intended extension |
| Add Crew tool cards, details panels, settings, or navigation entries | Intended extension |
| Replace an entire declared UI seat with a compatible Crew plugin | Deliberate substitution |
| Add a small domain-neutral slot or contract upstream | Framework evolution |
| Import DSH package-internal components or stores | Private API coupling |
| Patch conversation/session/connection internals | Fork gravity |
| Carry a permanent source patch stack | Experiment failure signal |

The target count of modified upstream DSH source files is zero.

## Initial client plugin set

A practical first bundle could contain:

```text
@fuzzyslipper/dsh-client-crew-runtime
  one typed connection to Crew domain data
  immutable snapshots and subscription lifecycle

@fuzzyslipper/dsh-client-crew-agent
  persistent Crew identity, role, presence, and runtime badge

@fuzzyslipper/dsh-client-crew-task
  current task, ownership, related work, and status

@fuzzyslipper/dsh-client-crew-messaging
  inbox, direct message composition, and delegation visibility

@fuzzyslipper/dsh-client-crew-review
  exact-SHA review tickets, CI status, findings, and actions

@fuzzyslipper/dsh-client-crew-toolview
  rich presentation for Crew-specific tools and durable tickets
```

They may begin in one package, but the service boundaries should remain visible so they can separate later without architectural surgery.

## First UI contributions

Keep the stock DSH conversation workbench intact. Add only Crew-specific value:

- a compact Crew identity and task header;
- role, project, and organizational context;
- an agent-message composer;
- delegation and agent-team activity presentation;
- a review/CI details panel;
- native cards for Crew message, task, delegation, and review tools;
- links between the DSH session and the wider Crew fleet/catalog view.

This tests whether Crew's organizational world can inhabit DSH Web without changing its generic transcript machinery.

## Layout strategy

Use two stages.

### Stage A: Keep the stock layout

Contribute into declared slots and existing navigation/details surfaces.

This is the safest test of extension quality because it minimizes assumptions about DSH client internals.

### Stage B: Replace the root layout plugin if necessary

If the work environment genuinely requires different spatial ergonomics, provide a complete Crew layout plugin that owns the root seat while continuing to expose compatible child seats for:

- sidebar;
- conversation;
- details;
- empty/session states;
- optional organization or activity panes.

This allows Crew to own desk arrangement without owning every renderer, store, and network pump underneath it.

Do not begin with Stage B merely to reproduce Rusty View's appearance.

## Data ownership

The browser should project two authorities:

```text
DSH Session
  canonical computational event log for the DSH-backed thread

Crew services
  canonical organizational metadata and workflow state
```

The UI may combine them, but it must retain provenance. For example:

```text
session event
  source = dsh
  session id
  sequence number

review status
  source = crew
  review ticket
  exact commit SHA
```

Do not copy Crew workflow state into fake DSH transcript events solely for presentation.

## Rusty View role during the experiment

Rusty View remains the cross-runtime fleet console and compatibility surface.

It should:

- list all Crew agents regardless of runtime;
- show whether a session is native Crew, Codex, or DSH-backed;
- retain operational controls not yet exposed through DSH;
- link a DSH-backed session into its DSH Web workbench;
- continue presenting legacy sessions;
- provide fallback observability when the experimental client bundle breaks.

This prevents the DSH Web experiment from being blocked on universal runtime translation.

## Cross-runtime question deferred

Do not initially force native Crew and Codex-only sessions into DSH's session/event ontology so DSH Web can display everything.

That may later be addressed through:

- a foreign-session projection service;
- importing or translating runtime-neutral events;
- a separate client plugin that presents non-DSH sessions;
- gradual migration as DSH becomes a more common execution substrate.

The first experiment is successful if DSH-backed agents have an excellent integrated workbench, not if DSH Web becomes a universal fleet UI immediately.

## Packaging model

Near-term DSH client extension may remain distribution-oriented rather than fully independent npm installation.

The expected artifact is therefore:

```text
pinned DSH revision
+ Crew host plugins
+ Crew client plugins
+ alternate profile/roster configuration
```

This is acceptable as long as upstream source remains unmodified.

Keep all DSH compatibility knowledge in a narrow adapter layer. Client feature packages should depend on Crew contracts and documented DSH extension contracts, not on the pinned revision's internal stores.

## Upgrade canary

Each pinned DSH upgrade should run a focused browser canary:

1. DSH host and client applications boot.
2. Every Crew host/client fiber reaches active state.
3. Expected service and slot topology is present.
4. A session opens and receives streaming output.
5. Crew identity and task data appear.
6. A Crew message can be sent.
7. A review ticket updates live.
8. Reconnect restores durable session state.
9. Plugin unload/reload removes and restores every owned contribution.
10. No console errors or duplicate subscriptions remain.

## Minimum credible implementation

1. Run a pinned `crew-dsh` Web profile.
2. Open one DSH-backed Crew agent session in stock DSH Web.
3. Load a Crew client runtime service without upstream source edits.
4. Display Crew identity, role, project, and current task.
5. Send a Crew inter-agent message from the browser.
6. Render a Crew review request as a native tool card.
7. Show asynchronous CI/review progress in a details surface.
8. Restart the host and reconnect the browser.
9. Disable and re-enable the Crew UI bundle without ghost entries.
10. Link the same agent from Rusty View into the DSH workbench.
11. Upgrade the pinned DSH revision once.
12. Confirm the private-import and upstream-patch counts remain zero.

## Success criteria

- Crew UI functionality is implemented entirely through public DSH client services, events, and slots.
- The stock conversation renderer requires no Crew-specific modifications.
- Crew domain state has one browser connection/service family rather than miscellaneous sockets.
- Plugin lifecycle cleanly removes stores, subscriptions, and UI contributions.
- Rusty View can remain smaller and focused rather than duplicating the workbench.
- DSH upgrades mostly affect one compatibility adapter or roster.
- The resulting environment is comfortable enough for daily development work.

## Failure signals

- Frequent imports from DSH `src` paths.
- Crew plugins directly manipulating DSH conversation stores.
- A growing patch stack against DSH Web internals.
- UI slots are too coarse, forcing unrelated features into one owner.
- Host and browser disagree about plugin or capability availability.
- Crew workflow state is duplicated into DSH transcript state.
- Rusty View and DSH Web both require full implementations of the same workbench feature.
- Every DSH release breaks many Crew client packages.

## Possible end states

### DSH Web becomes the normal workbench

Rusty View shrinks into fleet control, compatibility, and organization-wide observability.

### The two remain complementary

Rusty View handles the whole organization while DSH Web handles deep work on DSH sessions.

### DSH Web proves too brittle or opinionated

Crew keeps Rusty View, but can still reuse the host-side DSH execution experiments. This is a valid negative result and should not compromise the backend work.