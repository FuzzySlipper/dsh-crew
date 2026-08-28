# Crew Review live deployment

The live review path is split between the trusted agent box and `den-srv`:

```text
Den submit_task_for_review
  -> Den MCP on den-srv
  -> http://127.0.0.1:8413 (remote end of SSH tunnel)
  -> crew-review on the agent box
  -> ephemeral Codex App Server reviewer
  -> Den finalize_review
```

`crew-review` is a user service on the agent box. It listens only on
`127.0.0.1:8413`, keeps its durable submission/job ledger in
`~/.local/state/crew-review/crew-review.sqlite`, and starts private ephemeral
Codex threads with `/home/system/crew-services/reviewer.md`. Ordinary service
settings, including the reviewer model and reasoning effort, live beside it in
`/home/system/crew-services/crew-review.env`. A changes-requested reviewer can
be retained for the same Den task for up to 12 hours; terminal
completion, expiry, explicit release, or process restart disposes it.

`crew-review-den-tunnel.service` runs a persistent reverse SSH tunnel:

```text
-R 127.0.0.1:8413:127.0.0.1:8413 den-srv
```

This makes the agent-box service appear loopback-local to Den MCP without a LAN
listener. Den MCP owns the public `submit_task_for_review` route and has a
`crew-review` backend at that address. The route does not fall back to Rusty
Crew. `required_checks: []` is an ordinary no-check submission; otherwise Den's
check gate must pass before the job is admitted.

DSH does not run reviews. The `dsh-crew-messaging` Web plugin proxies the
service's bounded pool projection through a same-origin Host route and shows it
under **Settings -> Crew**. It exposes capacity, queue/running/finalizing counts, active jobs, recent
results, retained task-affinity expiry, and failures, but not Codex thread IDs,
prompts, transcripts, or Den finding details. Set
`DSH_CREW_REVIEW_URL=http://127.0.0.1:8413` in the DSH service environment when
the default is not suitable.

## Update and restart

Update the review binary from `crew-services`, then restart its user service:

```sh
git -C /home/dev/crew-services pull --ff-only
env --chdir=/home/dev/crew-services go build \
  -o /home/agent/.local/bin/crew-review ./cmd/crew-review
systemctl --user restart crew-review.service
```

The tunnel normally stays running across a review-service restart. Restart it
only when its SSH connection or unit changes:

```sh
systemctl --user restart crew-review-den-tunnel.service
```

After changing the DSH plugin, rebuild/install it using the current nested DSH
checkout and restart Web. The exact local package workflow remains in the
[plugin setup guide](../plugins/crew-messaging/docs/agent-box-setup.md).

```sh
systemctl --user restart dsh-web.service
```

Den MCP deployment is owned by `den-services`; use its repository deployer
after updating the checkout on `den-srv`:

```sh
/data/services/den-services/scripts/den-services-deploy.sh mcp \
  --repo /data/services/den-services --no-pull
```

## Readback

These checks cover each live hop without starting a review:

```sh
systemctl --user is-active crew-review.service crew-review-den-tunnel.service dsh-web.service
curl --fail http://127.0.0.1:8413/healthz
curl --fail http://127.0.0.1:8413/v1/review-pool
ssh den-srv curl --fail http://127.0.0.1:8413/healthz
curl --fail http://127.0.0.1:3080/plugins/dsh-crew-messaging/review-pool
ssh den-srv curl --fail http://127.0.0.1:5199/version
```

Den managed completion currently accepts `looks_good` and
`changes_requested` for this service. It does not expose a separate `blocked`
verdict through this path. Only a successful controller-bound
`complete_review` call produces a Den verdict; ordinary final text or turn
completion does not. A reviewer that cannot make a normal verdict must not
fabricate an approval or finding. The pool instead records a failed job with
the runtime failure or last rejected-completion reason for operator follow-up.
