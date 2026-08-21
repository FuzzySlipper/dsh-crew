# Experiment 02: Codex App Server as a native DSH brain

## Question

Can Codex App Server implement DSH's public `AgentFactory` and `Agent` interfaces while Codex remains the authority for its native turn progression and continuation? This is a brain experiment, not an LLM-adapter exercise. The current [Agent and AgentFactory reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md), [agent lifecycle](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/agent-lifecycle.md), and [Cordis architecture](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md) own the DSH facts this work must follow.

An LLM adapter translates an inference protocol for the stock loop. A native brain owns model-specific continuation, turn control, and native-tool semantics. Those are different substitutions even when both speak to the same model product.

DSH's existing [Codex subagent](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/subagent.md) is useful evidence that a Cordis provider can run Codex App Server, but it is a subagent seam, not a durable native brain. Its behavior should be consulted rather than stretched into a claim about full-agent resume or projection.

## Proposed division of authority

```text
DSH AgentRegistry
  -> CodexAgentFactory
       -> CodexAgent + agent-local Cordis context
            -> Codex App Server thread and turns
```

Codex owns native continuation state, turn and item progression, and native harness behavior. DSH owns the public Agent lifecycle, scoped plugin ownership, the public inbox, and the durable session facts it promises to its own plugins and UI. External coordination systems retain their own identity, task, and organizational state.

The adapter must create and resume through `ctx.agents`, use caller-owned setup and disposal, and never construct or import the stock loop's private implementation. It should project Codex activity into standard DSH events only where the meanings actually agree. A Codex-specific fact remains namespaced and explicit; a renderer can consume it without pretending it was a generic event.

## Inbox, tools, and failure semantics

Map `followup`, `steer`, `inject`, and `cancel` only to a supported Codex operation. `followup` can queue work; interruption must settle the active native turn and leave a stated inbox outcome. Steering or non-waking injection must fail clearly when Codex does not supply their required semantics. Silent conversion of a steer into ordinary follow-up is not acceptable.

Codex may retain native tools, expose selected DSH/Crew capabilities through a bridge, or use a deliberate hybrid. The first slice should make the authoritative mutator clear for every overlapping operation. DSH tool logging and policy cannot be claimed for native actions it does not mediate; native fidelity cannot be claimed if all native behavior is flattened through the stock tool loop.

Keep the runtime adapter narrow: start or resume a native thread, start a turn, interrupt it, observe native events, and dispose its resources. The specific transport is replaceable; the experiment uses only the native operations it genuinely supports.

## Durable projection and resume

The DSH session records the DSH facts that plugins and users need to replay or inspect. The Codex provider keeps native resume material opaque and provider-owned. Resume either restores the native thread from that material or states the supported recovery path. It must not rebuild a misleading generic prompt history, discard unrepresentable native state, or publish an agent whose native continuation cannot honor the requested operation.

Creation and resume remain transactional: prepare the session, native binding, agent, and agent-scope setup privately; publish only after required setup succeeds; dispose every private resource on failure. The public [session](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md) and [scope](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/scope.md) references define the durable and lifecycle sides of that work.

## First credible result

Use a dedicated profile to create a persistent Codex-backed agent, run more than one native turn, render both ordinary DSH output and one explicit Codex projection, interrupt a turn, dispose it, and resume the same agent by the provider's supported path. Exercise one bridged coordination capability only if its authority is unambiguous. Compare that behavior with the product-native Codex path and a stock-loop LLM adapter on meaningful work; the question is whether native-brain fidelity survives alongside DSH lifecycle and observation.

Failure is informative when it exposes a real mismatch: a required public Agent operation cannot be represented, session projection fabricates facts, authority is split without a rule, or resume would silently lose meaningful native state. These conditions should reject the mapping explicitly rather than accumulate adapter magic.

This experiment follows the local [working principles](working-principles.md).
