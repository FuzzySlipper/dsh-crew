# Crew review service survey

Task: Den #7411

## Result

Den Review already owns the durable review lifecycle. The successor service should own reviewer runtime selection, private worker lifecycle, task affinity, and delivery of one controller-bound result to Den. It should not copy Den rounds, findings, task transitions, GitHub gating, or Rusty Crew session machinery.

The current normal verdict vocabulary is smaller than older review prose implies. `looks_good` finalizes the round and moves the task to `done`; `changes_requested` requires an actionable current-round finding and moves the task to `in_progress`. `blocked_by_dependency` and `follow_up_needed` are compatibility-only low-level verdicts, not normal finalization outcomes. A blocked, cancelled, failed, or otherwise incomplete reviewer job therefore releases its worker without calling normal Den finalization.

## Authority map

| Concern | Authority | Successor behavior |
| --- | --- | --- |
| Project, task, current round, findings, verdict validation, task transition, completion receipt | Den Review | Read through `get_review_context`; complete through `finalize_review`; retain Den receipts. |
| GitHub check status and exact commit SHA | Den Review gate/GitHub | Treat as separate readiness evidence, not review identity. |
| Reviewer procedure | `/home/agents/profiles/reviewer/SOUL.md` | Load as the configured reviewer profile and inject into each fresh worker. |
| Worker selection, task affinity, FIFO, Codex thread lifecycle | Crew review service | Keep private and in memory; do not publish each worker as a Crew/DSH session. |
| Model completion call | Crew review service dynamic tool | Bind to the active job by native thread/turn; never accept model-selected project, task, round, or correlation authority. |
| Observability | Crew review service, projected by DSH | Show one pool/job surface without native thread IDs or duplicate Den findings. |

## Current Den lifecycle

1. `request_review` creates or reuses the current undecided round, persists its request packet, and transitions the task to `review`.
2. `get_review_context` returns `den_review.reviewer_context.v1` with the task, repository/root hint, current round, findings, packet/guidance handles, gate state, and an explicit next state.
3. A reviewer inspects the current checkout. Review identity is project, task, round, and correlation. Repository/ref/SHA may accompany a separate gate, but a source revision is not part of round or finalization identity.
4. `finalize_review` accepts one normalized result for the current round. It stores verdict/findings, appends the canonical task-thread packet, transitions the task, and returns `den_review.completion_receipt.v1`.
5. An identical retry resumes or returns the same finalization. A different material result conflicts. A superseded round fails as `stale_review_round`.

The service must use the typed Review APIs and receipt. It must not infer completion from task messages or task status.

## Rusty Crew donor lessons

Rusty Crew proves several useful behaviors but should not remain in the successor route:

- reviewer profile selection is controller-owned, never model-selected;
- one managed review envelope is delivered per turn;
- queued reviews start as later turns rather than interrupting active work;
- completion is bound to reviewer session, dispatch/correlation, task, and round context;
- locally invalid completion can be corrected, but persistence or an ambiguous receipt must reconcile the same operation rather than send another result;
- exact route/binding identity prevents renamed or replaced sessions from inheriting authority;
- the requester receives one receipt-based result only after Den finalization succeeds.

The reusable procedure lives in `/home/agents/profiles/reviewer/SOUL.md`. Rusty-specific `complete_routed_review`, wake routing, reply delivery, persistent reviewer sessions, and exact-SHA submission records are implementation donors rather than successor dependencies.

## Codex App Server findings

The current protocol supports `thread/start` with `ephemeral: true`, thread-scoped `developerInstructions`, `dynamicTools`, working directory, model/provider, and permissions. A thread accepts multiple sequential `turn/start` calls.

Ephemeral threads have important limits:

- they do not support `thread/queue/*` submissions;
- they do not support canonical turn-history reads;
- there is no client `thread/close` or `thread/dispose` method;
- they are absent from persistent thread history after restart, but active in-memory list visibility still needs a focused live probe.

Consequently the reviewer service must own per-worker FIFO, wait for native turn completion notifications, and treat the controller-bound completion tool as the result authority. Releasing a worker means forgetting its affinity and never reusing its thread. Codex currently provides no stronger explicit in-process eviction receipt; service/App Server restart remains the accepted physical cleanup boundary.

## Implementation direction

Add `crew-review` as a sibling service in `crew-services`, not as review vocabulary inside the messaging core. It may reuse the low-level App Server JSON-RPC transport after extending that transport with parameterized ephemeral thread creation, lifecycle notifications, and turn completion waiting. Keep Den HTTP details in a Den adapter and Codex details in a reviewer-runtime adapter.

The first live probe should cover an ephemeral start, two sequential turns, thread-list visibility, completion-tool binding, late notification rejection after release, and restart loss. This is focused compatibility evidence, not a version gate.
