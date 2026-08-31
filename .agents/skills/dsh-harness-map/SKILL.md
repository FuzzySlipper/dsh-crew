---
name: dsh-harness-map
description: Use when a question or task concerns DeepSeek Harness (DSH) itself — how the plugin/Cordis runtime works, which capability or subsystem owns a behavior, where the authoritative doc lives, how skills/sessions/plugins resolve on this machine, or before implementing or reviewing a DSH plugin. Routes to the system checkout docs and this machine's dsh-crew notes instead of crawling source; links the full material for deep dives.
---

# DSH Harness Map

Orientation and routing, not authority: the linked documents own exact names, signatures, and defaults. The system checkout is the live reference; prefer its `docs/` over GitHub URLs cited by older notes.

## The model in five facts

- Everything is a plugin on vendored Cordis. Plugins contribute services, typed events, and reversible registrations to a context; fibers give each mounted plugin a lifetime; every registration goes through `ctx.effect()` / `ctx.on()`, and unloading its owner removes it.
- A capability is a complete Definition / Provider / Consumer seam. A registry belongs at the seam only when several providers genuinely coexist; a provider must be replaceable without teaching its consumers provider-specific behavior.
- Events are semantic, not generic callbacks. Broadcast for independent observation, ordered/claiming when one participant decides, waterfall for around-operation decisions; waterfall listeners MUST call `next()` or they veto the chain.
- An Agent is live execution (inbox, status, cancellation); a Session is durable evidence — an append-only event log from which history, replay, UI projection, and resume derive. Do not conflate them.
- Model-visible means logged: anything that reaches a model request must be reconstructable from the session log. New behavior belongs on documented extension points, not `agent-loop` edits.

## Where a fact lives — checkout docs

Checkout root: `/home/system/dsh/`. Paths below are relative to it; bilingual `.zh.md` siblings exist for most pages.

- Big picture and package map: `docs/architecture.md` — read before changing `packages/`.
- Plugin mechanics, dispatch modes, loader config (`!!js`, overlays): `docs/cordis-primer.md`; hands-on: `docs/cordis-tutorial/`.
- Vocabulary (`capability seam`, `fiber`, `effect`): `docs/glossary.md`.
- Per-capability references, one page per subsystem: `docs/subsystems/<name>.md` — core, session (+ projection/query/reference/telemetry), subagent, agent-team, skills, tools, shell, filesystem, sandbox, web, workflow, compaction, system-prompt, approval, and more. `docs/subsystems/skills.md` owns how the skill catalog resolves.
- Adding a tool, package, LLM adapter, or settings card: `docs/cookbook/`; the extension decision map is `docs/cookbook/extension-cookbook.md`.
- Test tiers and focused checks: `docs/testing.md`.
- Subprocess/lifecycle/concurrency bug classes: `docs/defensive-patterns.md`.
- Generated catalogs: `docs/tool-catalog.md`, `docs/event-producer-consumer.md`, `docs/config-catalog.md`, `docs/persistence-catalog.md`, `docs/module-graph.md`, `docs/graph-atlas.md`.
- Why things are that way: `docs/postmortem/` and `.agents/notes/` (`implemented/` is shipped reality; `archived/` is frozen history).

Package READMEs carry per-package contracts, config tables, and model/token effects; `packages/README.md` groups the workspaces.

## Local project notes — dsh-crew docs

`/home/dev/dsh-crew/docs/` holds this workspace's experimental material; DSH facts cited there defer to the system checkout.

- `cordis-architecture-dsh.md` — local mental model of Cordis in DSH.
- `cordis-research-paper-summary.md` — implementer-level summary of the spatiotemporal-composability paper.
- `working-principles.md` — lab rules: build beside DSH, no forks or pins, thin vertical slices, compose existing capabilities before recreating them.
- `experiment-01-crew-dsh-sidecar.md` through `experiment-04-swappable-brain-broker.md` — Crew↔DSH experiments.
- `next-runtime-adapter-survey.md` — direction for the next Crew messaging runtime adapter.
- `trusted-lan-web.md` — local LAN and SSH access approaches.

## This machine's runtime facts

- Checkout: `/home/system/dsh/` — a clean moving upstream reference outside the experiment repository. Before DSH-dependent work, run `git -C /home/system/dsh status --short --branch` and `git -C /home/system/dsh pull --ff-only`.
- Config root: `DSH_HOME=/home/agent/.dsh/`.
- Web GUI: `http://127.0.0.1:3080`; the trusted-LAN plugin also exposes the configured LAN route.
- Codebase Memory indexes the checkout as `deepseek-harness`; navigate with it, then read exact current source before compatibility claims.

## Ownership boundary

Do not implement experiments in `/home/system/dsh` or commit there. DSH is the current upstream reference and runtime build. Plugin and experiment work belongs in `/home/dev/dsh-crew`.
