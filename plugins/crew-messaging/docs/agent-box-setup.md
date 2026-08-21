# DSH Crew messaging agent-box setup

This adapter is for one trusted local box. Explicit bindings map a root-session ID to an address and take precedence over title discovery. Otherwise, a user-renamed root session becomes its title address (for example, `Beta`); automatic titles and durable subagents are excluded. The adapter does not expose arbitrary DSH session IDs or provide a remote transport.

Start the sibling fabric first, following [the crew-services agent-box runbook](../../../../crew-services/docs/agent-box-runbook.md). Use bindings when an operator needs an explicit override; use `[]` to enable only user-title discovery:

```sh
export DSH_CREW_MESSAGING_URL=http://127.0.0.1:8787
export DSH_CREW_MESSAGING_ADAPTER_ID=dsh-crew-messaging
export DSH_CREW_MESSAGING_INSTANCE_ID="$(hostname)-dsh-crew"
export DSH_CREW_MESSAGING_BINDINGS='[{"address":"alpha","sessionId":"<root-session-id-a>"},{"address":"beta","sessionId":"<root-session-id-b>"}]'

```

Changing this variable or the installed client bundle requires a `dsh-web.service` restart. The read-only directory, traffic, and runtime view is available at **Settings → Crew** after the restart. Historical fabric rows, including intentionally retained `outcome_unknown` records, are ledger history rather than currently pending deliveries.

Build the local bundle and install it into the existing web profile. The plugin command applies the bundle patch; do not apply `cordis.patch.yml` manually.

```sh
cd /home/dev/dsh-crew
pnpm --dir research/deepseek-harness exec tsdown --config ../../plugins/crew-messaging/tsdown.config.ts --tsconfig ../../plugins/crew-messaging/tsconfig.json
cd /home/dev/dsh-crew/research/deepseek-harness
DSH_HOME=/home/agent/.dsh pnpm dsh plugin --profile web add file:/home/dev/dsh-crew/plugins/crew-messaging
```

Keep the explicit `file:` prefix for a live profile. It installs the built
package into the profile's module tree, where current DSH supplies the
package's declared peers through its managed fallback. A `link:` install
resolves ESM imports from the source checkout instead and can bypass that
fallback.

Exports in an interactive shell do not reach the already-running `dsh-web.service`. Create the user-owned EnvironmentFile and drop-in directories first:

```sh
mkdir -p /home/agent/.config/dsh
mkdir -p /home/agent/.config/systemd/user/dsh-web.service.d
```

Put the adapter values in `/home/agent/.config/dsh/crew-messaging.env`:

```ini
DSH_CREW_MESSAGING_URL=http://127.0.0.1:8787
DSH_CREW_MESSAGING_ADAPTER_ID=dsh-crew-messaging
DSH_CREW_MESSAGING_INSTANCE_ID=agent-box-web
DSH_CREW_MESSAGING_BINDINGS='[{"address":"alpha","sessionId":"<root-session-id-a>"},{"address":"beta","sessionId":"<root-session-id-b>"}]'
```

The outer single quotes are `EnvironmentFile` syntax and are stripped by systemd, preserving the JSON's inner double quotes in the value delivered to the web service.

Then create `/home/agent/.config/systemd/user/dsh-web.service.d/crew-messaging.conf`:

```ini
[Unit]
Wants=crew-messaging.service
After=crew-messaging.service

[Service]
EnvironmentFile=/home/agent/.config/dsh/crew-messaging.env
```

The ordering hint starts the local fabric with the web service when that user unit is installed; the adapter's normal `pollMs` initialization retry remains the race-safe path when the fabric becomes ready later.

Reload and restart only after those two user-owned files exist:

```sh
systemctl --user daemon-reload
systemctl --user restart dsh-web.service
systemctl --user status dsh-web.service
```

Use a stable `DSH_CREW_MESSAGING_INSTANCE_ID` for one running DSH profile. A restart registers/renews that adapter identity, rebuilds the explicit bindings, and reconciles the adapter-owned `dispatching` records. A proven native inbox entry is acknowledged; an unprovable one becomes `outcome_unknown` and is never resent automatically.

The profile’s existing DSH session persistence is required for cold-root recovery. The adapter resumes only the exact configured root and refuses a persisted `origin: 'subagent'` session. Busy roots receive `followup()` next-turn work; this adapter does not steer, cancel, or inject into the active turn. Ordinary delivered frames show how to make a linked reply when one is warranted; reply frames are terminal by default and must not create an acknowledgement loop.

For a current-source check and the real local binary probe:

```sh
cd /home/dev/dsh-crew
pnpm --dir research/deepseek-harness exec tsc --noEmit -p ../../plugins/crew-messaging/tsconfig.json
pnpm --dir research/deepseek-harness exec vitest run --config ../../plugins/crew-messaging/vitest.config.ts
pnpm --dir research/deepseek-harness exec tsx ../../plugins/crew-messaging/scripts/agent-box-probe.ts
```

The probe builds a temporary `crew-messaging` binary, starts it on a disposable loopback port with a disposable SQLite file, and joins it to a current-source keyless DSH Cordis context. That context mounts `AgentLoop`, its current test prerequisites, JSONL session persistence, the current `MockAdapter`, two actual roots, and `CrewMessagingProvider`. The Go restart readback includes bindings, messages, and deliveries. Rounds remain covered by the focused Go restart test named below.

| Scenario | Evidence |
| --- | --- |
| Two unrelated roots exchange ordinary message | Live `agent-box-probe.ts`; `service.spec.ts` “binds unrelated roots and sends in both directions with stable replay identity” |
| Exact retry makes one fabric delivery/no duplicate wake | Live probe; `messages_test.go` `TestExactReplayAfterAuthorityDriftDoesNotNeedNewIDs` |
| Busy work has no steer/cancel and durable next turn | Live probe; `service.spec.ts` “uses next-turn followup for a busy target and never invokes a steering surface” |
| Idle/cold exact resume and FIFO | Live probe; `service.spec.ts` “resumes the exact inactive root and preserves per-address FIFO pumping” |
| Linked reply schedules original sender noninterruptingly | Live probe; `round_semantics_test.go` `TestReplyValidationAndReplayAreSticky` |
| Restart preserves directory/messages/deliveries/rounds | Live probe for directory/messages/deliveries; `directory_test.go` `TestDirectoryPersistsFencingAndBindingGenerationsAcrossRestart`; `messages_test.go` `TestMessageAcceptanceReplaySettlementAndRestart`; `round_semantics_test.go` `TestRoundRestartRetainsReplyLinkAndTrafficLegs` |
| Pre-dispatch failure/crash releases or reaps claim | `service.spec.ts` “releases an unavailable cold root before dispatch without beginning or reporting unknown”; `http_test.go` `TestMaintenanceReapReleasesExpiredClaimAndIsRepeatable` |
| Post-begin crash reconciles native evidence or unknown | `service.spec.ts` “reconciles proven dispatches to acknowledgement and ambiguous ones to outcome_unknown”; `delivery_test.go` `TestFencedDeliveryLifecycleReplayFIFOAndUnknownSettlement` |
| Semantic rebind fences old queued work | `messages_test.go` `TestDeliveryFIFOCancellationAndBindingDriftSettlement`; `delivery_test.go` `TestDispatchReconcilesAfterRebindByDurableAttemptOwner` |
| Inspection/history/replay are non-actuating | Live probe; `http_test.go` `TestMessageEndpointsExposeReplayAndReadOnlyLedger`; `http_test.go` `TestRoundAndTrafficEndpointsRemainThinAndReadOnly`; `acceptance.spec.ts` “replays next-turn and next-step splices in independent coordinate spaces” |
