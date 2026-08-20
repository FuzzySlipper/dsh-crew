# DSH Crew Experiment Notes

This repository is a companion laboratory for exploring whether DeepSeek Harness (DSH) and Cordis can become the generic compositional substrate beneath selected Rusty Crew capabilities.

The goal is **not** to immediately replace or shelve Rusty Crew. The goal is to build experiments that are useful if they succeed, informative if they fail, and capable of growing into a successor architecture without beginning as knowingly disposable spike code.

## Core hypothesis

Rusty Crew currently owns a very large surface because missing seams repeatedly forced it to absorb the subsystem behind each desired feature. DSH may provide enough runtime structure that Crew can return to owning the things that are specifically valuable to Crew:

- durable organizational identity;
- inter-agent messaging and task ownership;
- session discovery and long-term cataloging;
- review, GitHub, and exact-SHA CI governance;
- selected Rust services where deterministic authority matters;
- policy and coordination across heterogeneous agent runtimes.

DSH/Cordis would then own more of the generic machinery:

- plugin composition and lifecycle;
- tools, skills, memory, and model-provider ecosystems;
- ordinary agent/session execution infrastructure;
- browser workbench infrastructure;
- inspectable service, event, and UI topology.

This division is provisional. Each experiment should make ownership clearer rather than presuppose the final answer.

## Architectural principles

### Preserve model-native harnesses where they matter

A provider-neutral LLM API is not always a provider-neutral *agent*. Some models are trained around a particular harness, action grammar, prompting scheme, or tool loop, and performance can fall when that surrounding machinery is flattened into a generic completion interface.

The experiments therefore distinguish three layers:

1. **Society and body**: identity, sessions, organization, tools offered by the wider system, UI, persistence, policy, and lifecycle.
2. **Brain**: the concrete turn driver and model-native harness semantics.
3. **Provider transport**: the protocol used to reach an inference service.

Changing a provider adapter is not necessarily the same as changing the brain.

### Make authority explicit

Every experiment should identify one authoritative owner for each durable fact. In particular:

- Crew agent identity is not automatically a DSH session ID.
- A durable session is not the same thing as a live in-memory agent activation.
- A UI projection is not a second transcript authority.
- A process connection must not own the lifetime of durable work.

### Prefer composition over private patches

The default compatibility budget is:

- no permanent private DSH fork;
- no imports from DSH package-internal `src` paths;
- use public Cordis services, event contracts, slots, and plugin entrypoints;
- pin an exact DSH revision and upgrade deliberately;
- propose small domain-neutral seams upstream when a real extension point is missing;
- treat recurring upstream source patches as evidence that the substrate has failed the experiment.

### Generate evidence for human and agent governance

The experiment should expose machine-readable topology wherever possible:

- service providers and consumers;
- event producers and listeners;
- waterfall ordering and `prepend` use;
- UI slot ownership;
- lifecycle ownership;
- cross-package and cross-process authority boundaries.

Cheap drift checkers should be able to flag suspicious changes without reconstructing the entire architecture.

## Experiment tracks

### 1. [Rusty Crew ↔ DSH sidecar](experiment-01-crew-dsh-sidecar.md)

Make a DSH-backed agent a full Crew citizen through a durable duplex service boundary. Crew initially supervises DSH much as it supervises Codex App Server, but the DSH side is a real Cordis application that can gradually absorb generic harness responsibilities.

### 2. [Codex App Server as a native DSH brain](experiment-02-codex-native-agent-factory.md)

Implement Codex as a DSH `AgentFactory`/`Agent`, not merely as an `LlmAdapter` or one-shot subagent. This is the strongest available test of whether DSH truly permits a foreign model-native loop to inhabit the framework while retaining DSH sessions, plugins, UI, lifecycle, and Crew services.

### 3. [DSH Web as a Crew workbench](experiment-03-dsh-web-crew-workbench.md)

Use DSH's client-side Cordis application as the generic conversation workbench while adding Crew identity, task, messaging, delegation, and review surfaces through host and client plugins. Rusty View remains the fleet/control surface during the experiment.

### 4. [Per-agent swappable brain broker](experiment-04-swappable-brain-broker.md)

Explore the missing step between deployment-level loop replacement and true per-agent heterogeneity. The intended shape is a stable agent-factory broker routing named brain implementations such as the stock DSH loop, Codex App Server, and future model-native harnesses.

## Shared proving scenario

The experiments should eventually converge on one credible end-to-end scenario:

1. A persistent named Crew agent is executed by DSH.
2. It is visible in both Rusty View and the DSH workbench.
3. Its session survives process restart, connection loss, and cold hydration.
4. It receives a durable message from another Crew agent.
5. It uses DSH ecosystem capabilities such as memory, skills, or agent-team coordination.
6. It modifies a repository and requests Crew's existing exact-SHA review pipeline.
7. CI/review results return asynchronously and become model-facing input at the correct boundary.
8. A provider, memory plugin, UI plugin, or brain implementation can be changed without corrupting the durable session or organizational identity.
9. Generated topology remains understandable enough for automated drift checks.

A minimal prompt round trip does not prove this architecture. The target is a **minimum credible successor slice** containing one instance of each difficult relationship while avoiding premature feature breadth.

## Non-goals for the initial experiments

- Port every Rusty Crew feature.
- Make DSH display every legacy Crew runtime immediately.
- Reimplement Crew's review pipeline inside DSH.
- Force Codex through a generic prompt/tool loop when the experiment is specifically testing native Codex behavior.
- Replace Rusty View before the DSH workbench has earned that responsibility.
- Stabilize DSH's pre-release APIs on its behalf.

## Relevant repositories

- [Rusty Crew](https://github.com/FuzzySlipper/rusty-crew)
- [Rusty View](https://github.com/FuzzySlipper/rusty-view)
- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
- [Codex App Server provider for DSH](https://github.com/wingoo/codex-plugin-dsh)

The existing projects are evidence and reusable machinery, not templates that must be copied literally.