# Gamescope default rollout — 2026-09-08

Gamescope/XWayland kiosk Firefox is now the default remote playtest browser on
den-srv. The normal Go service at 127.0.0.1:48200, CLI, and MCP use it; agents do
not need a new command or DSH plugin change.

The authoritative operator guide is
[crew-services playtesting](/home/dev/crew-services/docs/playtest.md).

## What fixed the issues

- **Sizing and stale browser chrome:** start Firefox directly with `--kiosk`
  and the game URL, under Gamescope `--force-windows-fullscreen`. The window
  and browser viewport are 1280×720. There is no address-bar typing or F11 step.
- **First pointer-lock movement jump:** set
  `dom.pointer-lock.reset-to-center-from-parent.enabled=false` in the dedicated
  Firefox profile. Keep native pointer locking enabled. This selects Firefox's
  legacy recentering path; it does not modify or discard gameplay input.
- **Startup focus/readiness:** start the container's Go loopback forwarder before
  Firefox, then inspect Gamescope's selected window for Firefox class, expected
  title, visible mapping and stream dimensions before the native focus click.

The preference is specific to this kiosk setup. Firefox's legacy path performs
more recentering/IPC and lacks the newer parent capture behavior for general
browser chrome. See [Mozilla Bug 1255338](https://bugzilla.mozilla.org/show_bug.cgi?id=1255338),
[Firefox 155 pointer-lock ownership](https://github.com/mozilla-firefox/firefox/blob/FIREFOX_155_0_1_RELEASE/dom/base/PointerLockManager.cpp),
and [recentering implementation](https://github.com/mozilla-firefox/firefox/blob/FIREFOX_155_0_1_RELEASE/dom/events/EventStateManager.cpp).
The tested browser was Firefox 155.0.1; this is an observation, not a version pin.

## Live acceptance

Evidence is in [evidence/refinement](evidence/refinement).

| Check | Observed result |
| --- | --- |
| Viewport | Fixture reports 1280×720; screenshots have no browser chrome |
| Absolute clicks | A, I, E, C, G, B, F, D, H all received trusted clicks at the exact requested screenshot coordinates |
| Lock transitions | Three acquisitions, including keyboard L from an off-center position; first deltas matched commands |
| Sustained relative input | Twenty (100,50) packets arrived unchanged while locked, totaling (2000,1000), without screen-edge clipping |
| One-command fixture | Startup selected the right mapped window; first scripted W key reached the document without manual refocusing |
| JS input | Trusted first (35,-15) and following (-35,15) movements matched after scripted native lock click |
| Recovery | `recover` released the old session and launched a fresh owned fixture lobby without manual browser navigation |
| CraftSurvive | One-command launch, native click to lock, mouse yaw/pitch sweeps, keyboard movement and controller look produced visible changes |
| Space | One-command launch and controller input changed displayed heading from 0° to 49° and speed from 5.6 to 6.3 |
| Installed default | A further `playtest start rusty-space` through the normal 48200 service returned Gamescope/kiosk and the visible game |
| Cleanup | No active service session, target lease, Wolf lobby/stream, or virtual controller remained; normal service active |

The fixture records trusted native events; commands were not injected through
DOM or game consoles. Input receipts and visible/browser effects remain separate.
Screenshots do not establish calibrated turn angles, collision correctness,
general game health, or measured frame freshness.

Game title/window readiness is not asset or input-handler readiness. In
CraftSurvive the later native click visibly acquired pointer lock after the
scene loaded. Agents should observe first and click the gameplay area when
needed. Firefox's brief pointer-lock notification can appear over early frames.

Useful files:

- `fixture-repeated-lock-events.json`: exact grid coordinates and lock/motion events.
- `fixture-one-command-events.json`: startup focus and JS input through the full launcher.
- `fixture-script.js`, `craft-script.js`: executed agent-runtime scripts.
- `craft-before-look.png`, `craft-mouse-yaw.png`, `craft-mouse-pitch.png`:
  visible FPS changes.
- `space-after-controller.png`, `production-space.png`: Space and installed-default readback.
- `recover.json`, `final-status.json`, `final-devices.json`: lifecycle evidence.

## Implementation and deployment

Durable code lives in crew-services:

- `internal/playtest/target/target.go`: managed entrypoint selection from the
  installed Wolf runner; game URL validated and passed as environment data.
  Exact lobby ownership and recovery remain target-owned.
- `internal/playtest/session/launch.go`: Gamescope window readiness, direct kiosk
  startup, and native focus. Legacy Sway launch remains available for rollback.
- `internal/playtest/wolf/launch.go`: forwards the game URL with the owned launch.
- `configs/playtest/firefox/{Dockerfile,startup-app.sh,user.js}` and
  `scripts/build-playtest-browser.sh`: managed browser image and preference.

The active runner uses `den-playtest-gamescope:local`, with
`RUN_GAMESCOPE=1`, `MOZ_ENABLE_WAYLAND=0`, `PLAYTEST_BROWSER_STARTUP=1`.
Its existing dedicated state is `playtest/user/WolfFirefox`.
Wolf itself still runs the stock `ghcr.io/games-on-whales/wolf:stable` image.
The Go target and local service were rebuilt/deployed. The installed game-profile
file was preserved, including the independently added rusty-dagger profile;
that game was not exercised in this rollout. Game servers were not restarted.

Focused Go package tests and race tests passed for session, target and Wolf
adapter; CLI package tests and shell syntax checks also passed.

## Rejected configurations and separate finding

`--force-grab-cursor`, `GDK_CORE_DEVICE_EVENTS=1`, and disabling Firefox's
native-lock preference did not remove the jump. Native Wayland Firefox crashed
with a GTK seat assertion in this image. The SDL-backend experiment terminated
before yielding a usable browser; no general claim about SDL support follows.

We also reproduced a real Wolf Wayland cursor-hint state bug: the handler
updated Smithay's pointer but not the compositor positions used for subsequent
movement. A regression failed before the synchronization fix; pointer tests
then passed (4), as did the core unit suite (24 passed, 1 ignored). However,
a live build containing that fix still produced the original (439,-280) first
delta for requested (20,0). It was therefore reverted from the running Wolf
service and is **not required by this default**. The narrow
[patch](wolf-cursor-hint-regression.patch) is retained for a separate upstream
follow-up; it was not submitted externally.

## Rollback

With no active playtest lease, change only the dedicated Firefox runner back to
`den-playtest-firefox:local`, `RUN_SWAY=1`, `MOZ_ENABLE_WAYLAND=1`, and remove
`PLAYTEST_BROWSER_STARTUP`/`RUN_GAMESCOPE`, then reload Wolf. The Go launcher
retains the legacy Sway path. A pre-rollout config copy exists on den-srv at
`/data/services/playtest-wolf/cfg/config.toml.before-gamescope`; do not overwrite
later unrelated configuration changes with that whole file.
