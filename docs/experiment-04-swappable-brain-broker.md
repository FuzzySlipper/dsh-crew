# Experiment 04: per-agent brain broker

## Question

DSH currently exposes one public `AgentFactory` registration. Can a small broker occupy that slot and route individual agent creation and resume to named brain providers, while every other plugin continues to program against the public Agent and Session APIs? The live [core reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/core.md) defines the single-factory behavior; [Agent Teams](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/agent-team.md) is the first coordination seam to inspect before adding orchestration.

```text
UI / teams / protocol drivers
          -> ctx.agents
               -> broker (one AgentFactory)
                    -> stock-loop provider
                    -> Codex provider
                    -> later providers
```

The broker selects an implementation; it never implements turn logic, translates a model protocol, or becomes a second session store.

## Minimal seam

A brain provider creates or resumes one concrete public Agent, and a lifecycle-owned registry registers providers by a stable route. The broker resolves an explicit route, a scoped or preset default, or a deployment default; absence is a configuration error. It delegates with the exact registration selected at the beginning of an asynchronous create/resume operation, so replacement cannot switch providers halfway through publication.

The public factory's transactional rules remain intact: provider work and agent-scope setup happen before publication, failed work leaves no live Agent or partial registration, and the returned handle owns disposal. Removing a provider blocks future selection; unloading its plugin must drain or dispose the live agents it structurally owns. The first slice does not automate cross-brain migration.

## Identity, resume, and capabilities

Persist the selected brain route when it is required to resume a session. Store native resume material as opaque provider-owned data, not as data interpreted by the broker. On resume, route to the recorded provider or report that the route is unavailable. A deliberate transfer to a different brain is separate product work, because one brain cannot honestly infer another brain's continuation state.

Model/provider selection and brain selection are independent axes. The stock loop can select an LLM route through DSH; a native Codex brain can own its native model selection. The broker chooses cognitive machinery, not a universal LLM adapter.

Ask for capability facts only when an operation needs them: for example, a UI must not offer true steering if the selected brain cannot perform it. A provider rejects an unsupported semantic request before publication or delivery. Do not manufacture a giant lowest-common-denominator capability schema merely to make all brains look alike.

## Credible first slice

1. Register the broker as the sole DSH factory and mount the stock loop behind one route.
2. Add one independent second provider, such as the native Codex factory from [Experiment 02](experiment-02-codex-native-agent-factory.md).
3. Create two agents with different routes in one DSH composition and confirm ordinary UI, session, and coordination plugins see only public Agent/Session behavior.
4. Resume each through its recorded route; remove one provider and confirm that only new work for that route fails clearly.

The [extension cookbook](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/cookbook/extension-cookbook.md), [scope reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/scope.md), and [session reference](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/session.md) define the applicable extension and lifetime mechanics.

The design has failed if the broker grows turn behavior, consumers branch on route names, generic event vocabulary absorbs provider-private facts, or resume guesses a provider from a current model configuration. The useful outcome is a modest routing seam that preserves native distinctions while sharing DSH's public lifecycle and durable observation.

This experiment follows the local [working principles](working-principles.md).
