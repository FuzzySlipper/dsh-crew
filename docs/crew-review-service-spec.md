# Crew review service specification

Task: Den #7412

## Purpose

`crew-review` is a trusted-box service that accepts durable Den review jobs and runs them on a selected reviewer runtime. The first runtime is a bounded pool of private Codex App Server threads. Den remains authoritative for review state; the service owns only job execution and ephemeral reviewer continuity.

This is a sibling service in `/home/dev/crew-services`. It must not add review, Den, or Codex concepts to the runtime-neutral messaging fabric.

## Job identity and input

The stable job key is:

```text
project_id + task_id + review_round_id + correlation_id
```

`POST /v1/review-jobs` accepts:

- a caller-supplied idempotency key;
- project, task, review round, and correlation identifiers;
- requested reviewer identity;
- repository/root and branch hints when present;
- optional gate evidence containing repository, ref, commit SHA, status, and evidence handle;
- optional request packet/detail handles.

The service stores the bounded job envelope before acknowledging it. Repeating the same key and normalized envelope returns the same job. Reusing the key with different material is a conflict. Source SHA is evidence, not review-round identity.

## Job lifecycle

Jobs use a small explicit state machine:

```text
queued -> running -> finalizing -> succeeded
                  \-> failed | cancelled | stale
```

- `queued`: durable job exists but no worker turn is active.
- `running`: one private worker owns the job and one native turn is active.
- `finalizing`: the structured completion request is durably stored and Den finalization is being reconciled.
- `succeeded`: Den returned a complete authoritative receipt.
- `failed`, `cancelled`, `stale`: terminal without normal Den finalization.

On restart, affinity and native worker state are empty. A queued job may start on a fresh worker. A running job without a stored result returns to queued. A finalizing job retries the identical stored Den request and reconciles its receipt. Terminal jobs remain bounded readback evidence under the configured retention limit.

## Den adapter

Before starting model work, the service calls `get_review_context` and requires the requested round to remain current and `source_review_ready`. Gate-pending, gate-failed, superseded, or otherwise non-reviewable context does not start a reviewer.

The completion adapter calls `finalize_review` with:

- controller-bound current review round;
- `looks_good` or `changes_requested`;
- configured reviewer identity;
- structured prior-finding resolutions and new findings;
- concise notes/evidence and optional runtime correlation fields.

The normalized finalization request is persisted before the external call. Identical retries reconcile the same Den finalization; typed conflicts and stale-round errors are surfaced on the job. Den's completion receipt is stored as the authoritative result.

Blocked, cancelled, interaction-unavailable, runtime-failed, and other non-review outcomes do not invent a Den verdict. They terminate the job and release the worker. A later review request starts clean.

## Reviewer runtime interface

The core job service depends on a narrow runtime interface:

```text
Acquire(task key, profile, workspace) -> worker
Run(worker, job prompt, bound completion tool) -> runtime outcome
Release(worker)
Close()
```

The runtime returns either a controller-validated structured completion candidate or a typed non-review outcome. It cannot finalize Den directly outside the supplied bound tool/controller.

## Codex backend

One supervised Codex App Server process owns a configurable maximum number of active/private worker mappings. Each clean worker is created with:

- `thread/start` and `ephemeral: true`;
- the task checkout root as `cwd`;
- the configured review profile, initially `/home/agents/profiles/reviewer/SOUL.md`, as developer instructions;
- a read-only review permission policy;
- only the dynamic managed-completion tool required for this route.

The completion tool schema accepts verdict, notes/evidence, prior finding resolutions, and new findings. Project/task/round/correlation and reviewer identity come from the controller's thread/turn binding and are not model arguments.

Each worker runs one turn at a time. The service owns FIFO because ephemeral Codex threads reject native queue operations. It waits for `turn/completed`; a completed turn without a successful bound completion result fails the job. Interactions that cannot be satisfied by the configured noninteractive review policy fail the job visibly rather than hanging or granting authority implicitly.

Releasing a worker deletes its service mapping and ignores subsequent notifications for its old generation. There is no upstream native eviction operation, so physical in-process reclamation is not claimed. App Server restart clears all native workers and is an accepted fresh-review fallback.

## Task affinity and TTL

Affinity key is project plus task. Review round is deliberately excluded.

- A task without retained affinity receives a clean worker.
- Only a complete authoritative Den receipt with verdict `changes_requested` retains the worker.
- The retention deadline is 12 hours after the most recently admitted review round for that task.
- A new round admitted before expiry uses the same idle worker and refreshes the deadline to admission time plus 12 hours.
- Jobs for the same task serialize. A second job waits while its retained worker is busy, then revalidates current Den context before starting.
- `looks_good` releases immediately.
- Failed, stale, cancelled, blocked, interaction-unavailable, or any other non-success outcome releases immediately.
- Expiry releases an idle retained worker and forgets affinity. No thread ID or affinity survives service restart.

The clock is injected for deterministic expiry tests. Pool capacity is calculated across all running and retained workers, not per queue candidate.

## HTTP and observation

The service exposes:

- `POST /v1/review-jobs` for idempotent admission;
- `GET /v1/review-jobs/{id}` for bounded status and Den receipt handles;
- `GET /v1/review-pool` for health, selected backend, capacity, queued/running counts, retained task affinities and expiry, recent terminal jobs, and actionable failure state;
- `DELETE /v1/review-affinities/{project}/{task}` only for releasing an idle retained reviewer.

Responses never expose native Codex thread IDs, prompts/transcripts, approval payloads, Den credentials, or messaging-fabric lease data.

## DSH projection

The existing Crew plugin adds one same-origin read projection and a compact settings panel for the pool/job snapshot. DSH does not dispatch review work, render duplicate Den findings, or create one session per worker. The only initial control is refresh plus release of an idle retained task affinity if the service supports it.

## Focused acceptance matrix

| Risk | Required evidence |
| --- | --- |
| Duplicate admission or completion | Same request returns same job/Den receipt; changed material conflicts. |
| Stale round | Context mismatch prevents runtime start or Den finalization. |
| Wrong model-selected identity | Completion tool has no project/task/round/correlation arguments. |
| Missing profile | Worker start fails before a turn; test observes injected reviewer instructions. |
| Cross-task contamination | New task always receives a new ephemeral worker mapping. |
| Rereview continuity | `changes_requested`, then a new round for the same task, reuses the live worker. |
| Wrong retention | Every non-`changes_requested` outcome releases immediately. |
| TTL | Injected clock proves sliding 12-hour refresh and idle expiry. |
| Pool accounting | Running plus retained workers never exceeds configured capacity. |
| Busy worker | Same-task work stays FIFO and revalidates current context before its turn. |
| Restart | Durable jobs reconcile; all worker and affinity state starts empty. |
| Late native result | Released worker generation cannot mutate a job or new affinity. |
| UI leakage | DSH snapshot contains no native thread IDs or transcripts. |

## Non-goals

- persistent or archived Codex reviewer sessions;
- restoring reviewer affinity after restart;
- one Crew address or DSH session per worker;
- review or GitHub-gate state copied out of Den;
- a generalized workflow/scheduler framework;
- provider matrices, federation, public-web security, or version pinning;
- reimplementation of Rusty Crew routing, wake, or requester messaging.
