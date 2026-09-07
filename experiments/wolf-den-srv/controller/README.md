# Wolf agent controller

Working single-slot prototype for den-srv. The target service owns the lease, input timing, cancellation, and session cleanup. The agent-side Python MCP server owns a private Xvfb/Moonlight viewer and durable screenshots. DSH connects through its existing Cordis MCP plugin; no DSH source changes are needed.

**Current acceptance limit:** capture, keyboard navigation, cancellation, and lifecycle work. Native virtual Xbox analog flight is verified in Rusty Space, and FPS movement, look, jump, crouch, and sprint in CraftSurvive; see [Xbox setup and evidence](virtual-xbox.md). Mouse targeting inside the stock nested-Sway Firefox app is unreliable: the streamed cursor can disagree with Sway's effective cursor. See [the focused reproduction](pointer-routing.md). FPS controller testing is accepted for that bounded CraftSurvive path; mouse aiming remains unaccepted.

```text
DSH / another MCP client
  └─ stdio MCP server here
       ├─ SSH → loopback controller on den-srv → Wolf Unix socket → compositor input
       └─ private Moonlight viewer ← H.264 stream from den-srv
            └─ PNG artifacts + append-only JSONL here
```

Rendering/encoding stay on the RX 9070 XT. This first capture route decodes in software on the agent computer. It needs no human viewer, physical display, or HDMI plug. Audio capture is not implemented; the viewer uses a dummy audio output.

## Run

The target is already deployed as `den-playtest-controller.service`, using the existing `docker-rt` account. It listens only on `127.0.0.1:48190`; the bridge reaches it over existing SSH access. Wolf exposes uinput for the Xbox pilot; the rootless Docker daemon is unchanged.

On this machine, dependencies and `config.json` are already installed. To recreate the Python environment:

```sh
cd /home/dev/dsh-crew/experiments/wolf-den-srv/controller
uv venv .venv
uv pip install --python .venv/bin/python -r requirements.txt
cp config.example.json config.json
.venv/bin/python server.py --config config.json
```

The last command speaks MCP over stdin/stdout. It is intended to be launched by an MCP client. Required local programs are SSH, Xvfb, xwininfo, xdotool, ImageMagick `import`/`identify`, and Linux `/usr/bin/python3` with `os.pidfd_open`. `config.json` supplies the Moonlight executable, paired configuration directory, target addresses, bitrate, and artifact directory. The ignored pilot Moonlight installation is reused.

Load the opt-in DSH patch:

```sh
dsh web --patch /home/dev/dsh-crew/experiments/wolf-den-srv/controller/cordis.patch.yml
```

Use a vision-capable model with DSH's attachment support for image observations. This patch has been tested with the current DSH Cordis MCP plugin. It is not installed globally or added to every agent's tool list. A dedicated agent preset can include the same plugin entry later.

## Tools

| Tool | Behavior |
| --- | --- |
| `acquire` | Reserves the configured paired client, starts a private viewer, returns a lease ID and stream dimensions. Defaults: Wolf UI, 1280×720, 30 FPS, 300-second inactivity TTL. |
| `observe` | Returns an MCP PNG image block and artifact metadata. Renews the lease. |
| `input` | Runs an ordered batch of key holds/chords, relative moves, absolute points, clicks, simultaneous Xbox states, and waits on den-srv. |
| `cancel` | Cancels the active batch; target releases held keys/buttons and neutralizes the Xbox controller. |
| `status` | Reads lease/session/lobby state and the latest input/release receipts. Supplying the lease ID renews it; omitting it does not. |
| `release` | Cancels input, stops the session and tracked exclusive lobbies, stops local capture, and retains evidence. Cleanup failures are reported separately. |

In DSH the names are `mcp__playtest__acquire`, `mcp__playtest__observe`, etc. Only one controller process and one lease may own this slot. Other paired client IDs are not stopped. Do not use this pilot's paired Moonlight configuration for a concurrent manual stream.

Example input arguments:

```json
{
  "lease_id": "<acquire result>",
  "steps": [
    {"kind": "hold", "keys": [87], "ms": 250},
    {"kind": "move", "dx": 120, "dy": -15},
    {"kind": "wait", "ms": 100}
  ]
}
```

Keys are Windows virtual-key integers: W=87, A=65, Enter=13, Escape=27, Ctrl=17, Shift=16, arrows=37–40. Chords use multiple keys in one hold. Every hold/click releases before the next step; controls are not retained across calls. A `gamepad` step supports simultaneous sticks, triggers and buttons for its duration; see [the Xbox contract](virtual-xbox.md). `point` requires x/y/width/height. Click button values are 1=left, 2=middle, 3=right. Observe effects instead of equating acknowledgement with success.

The entire batch is validated before delivery, with at most 100 steps and 10 seconds of requested waits. New input delivery shares a ten-second target deadline, including packet I/O; key-up cleanup has a further two-second budget. Failed key-up delivery triggers session shutdown. A stalled Wolf API can delay that shutdown; receipts expose release failures rather than claiming a hard real-time guarantee. Explicit cancellation and MCP request cancellation use action IDs, including when cancellation reaches the target before input.

## Evidence and cleanup

Each lease has its own `state/<lease-id>/` directory. Screenshots are separate PNG files published after capture; `events.jsonl` appends small acquisition, action, observation, and release records. Release does not rewrite or truncate the evidence index. Target receipts also append to `/data/services/playtest-wolf/controller/state/events.jsonl`, allowing recovery when the caller loses an input response. Moonlight logs contain credentials, remain under the private ignored state directory, and should not be pasted into task reports.

Observation metadata records capture start/end timestamps, pixel dimensions, lease/session identity, and capture source. It deliberately reports no game frame ID, no measured frame freshness, and unknown game readiness. A connected stream can show a loading or stale frame. Game-specific readiness, renderer checks, frame selection, and visual judgement remain separate work.

Normal MCP shutdown releases the lease. If the owner is killed, a Linux process guardian stops the private viewers; remote cleanup relies on target expiry, normally within the configured TTL plus cleanup time. Expiry is independent of SSH or the MCP connection. Target restart marks its saved lease expired and resumes cleanup. A missed cleanup leaves the slot unavailable with an error until cleanup succeeds.

**Wolf UI lobby tracking is best effort.** Wolf exposes connected session IDs, not a client owner. The controller records newly observed lobbies associated with this client, excludes lobbies present before acquisition, and retains any lobby with another connected client. Use ordinary **Start** for new private applications; joining/co-op is outside this prototype. A lobby created and detached between polls can escape tracking. Explicit controller-owned application/lobby creation should replace this association rule before parallel/shared lobby use.

Firefox's application state is persistent in Wolf's existing pilot directories. Session teardown is not a clean game-save/profile reset. Windows targets, audio, direct compositor capture, FPS pointer-lock acceptance, and genre-specific Cordis tools are not implemented in this slice.

## Validation

```sh
cd /home/dev/dsh-crew/experiments/wolf-den-srv/controller
.venv/bin/python -m unittest -v test_target.py
node --test dsh-compat.test.mjs
# Starts a real session, drives the UI, tests cancellation and waits for expiry:
.venv/bin/python live-smoke.py
```

Verified on den-srv on 2026-09-07 UTC:

- MCP returned actual 1280×720 PNG blocks; keyboard input navigated Wolf UI and launched Firefox.
- Ctrl+L and typing changed the remote browser; relative/absolute movement moved its visible cursor. Pointer/click targeting failed in nested Sway. A diagnostic Sway cursor warp followed by the same Wolf click activated the button, isolating recipient pointer synchronization as the remaining gap; no Sway fallback was added to the controller.
- Cancelling an eight-second Shift hold released it; the next typed `a` was lowercase. Explicit cancellation and MCP request cancellation also passed the automated live smoke at roughly half a second.
- Inactivity expiry removed the target session with the MCP connection still open. Abrupt owner exit stopped local viewers and target expiry cleared the lease. Explicit Firefox release removed its tracked lobby and session. Evidence remained readable after cleanup.
- Eleven focused failure tests cover pre-arrival cancellation, chord release, lost acknowledgements, invalid batches, delivery-budget exhaustion, wrong leases, expiry isolation, and restart recovery.
- The actual DSH Cordis MCP plugin loaded the patch, registered all six tools, called target status, and disposed the connection. This is plugin interoperability evidence, not an LLM-driven game acceptance test.

The source follows the installed [MCP Python SDK](https://github.com/modelcontextprotocol/python-sdk) and [Wolf API](https://games-on-whales.github.io/wolf/stable/dev/api.html). The deployment follows moving DSH upstream and Wolf stable rather than establishing exact-revision compatibility gates.

Representative MCP evidence: [before input](evidence/before-input.png), [after Enter](evidence/after-enter.png), [lowercase text after cancelled Shift](evidence/after-cancel.png), and the original [append-only session journal](evidence/session-events.jsonl). The copied PNG files retain their original contents; UUIDs and original artifact locations are recorded in the journal.

## Target service maintenance

The deployed Python source is `/data/services/playtest-wolf/controller/target.py`; its unit is `/etc/systemd/system/den-playtest-controller.service`. The checked-in unit records this slot's paired client ID. Changing identity requires a separately paired Moonlight configuration and the matching ID in the unit.

```sh
ssh den-srv sudo -n systemctl status den-playtest-controller.service
ssh den-srv sudo -n systemctl restart den-playtest-controller.service
ssh den-srv sudo -n systemctl stop den-playtest-controller.service
```

To update, copy `target.py` into its deployed location as `docker-rt:den-pi-docker`, then restart this controller unit. The service uses Python's standard library; no target Python packages, GPU driver changes, Docker restart, or host reboot are required.
