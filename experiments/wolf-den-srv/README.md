# Wolf on den-srv: remote playtesting pilot

Verified 2026-09-07 UTC. Wolf is installed and running on `den-srv` (`192.168.1.10`) using the existing rootless Docker daemon. The [agent controller](controller/README.md) now adds MCP input/capture/lifecycle tools and an opt-in DSH Cordis configuration. This is remote harness evidence, not Rusty-game acceptance.

## Deployment

- Host: Debian 13.4, kernel `6.17.13+deb13-amd64`, AMD RX 9070 XT (`gfx1201`), host Mesa 25.0.7.
- Container: `den-playtest-wolf`, image `ghcr.io/games-on-whales/wolf:stable`.
- Installed Compose file: `/data/services/playtest-wolf/compose.yaml`; repository copy: [compose.yaml](compose.yaml).
- Persistent state/config: `/data/services/playtest-wolf`, config under `cfg/config.toml`.
- Runtime sockets: `/data/services/playtest-wolf/runtime`.
- Management API: Unix socket `/data/services/playtest-wolf/wolf.sock`. The controller wraps it on target loopback port 48190, reached by an agent-side stdio MCP server over SSH.
- Moonlight: manually add `192.168.1.10`; advertised name `den-srv-playtest`. Pairing remains client-specific.
- Keyboard/mouse use the compositor's input path. Virtual Xbox uses uinput; see [the setup and evidence](controller/virtual-xbox.md). UHID/touch devices are not configured.

The service uses Docker's existing bridge and explicit port publishing. It does not allocate a new network, alter the rootless daemon, change the GPU driver, or require a host reboot. All physical HDMI/DP connectors reported disconnected during verification; an HDMI dummy plug was unnecessary.

Run management commands as the existing Docker owner:

```sh
ssh den-srv 'sudo -n runuser -u docker-rt -- env DOCKER_HOST=unix:///data/services/docker-rt/run/docker.sock docker compose -f /data/services/playtest-wolf/compose.yaml ps'
ssh den-srv 'sudo -n runuser -u docker-rt -- env DOCKER_HOST=unix:///data/services/docker-rt/run/docker.sock docker compose -f /data/services/playtest-wolf/compose.yaml logs --tail 40'
```

To stop the service after stopping its sessions and lobbies, use the same command prefix with `docker compose -f /data/services/playtest-wolf/compose.yaml down`. State stays in its bind directory. Starting uses `up -d`; updating uses `pull` then `up -d`.

One generated-config adjustment is required for the Wolf UI app: its socket mount is `/data/services/playtest-wolf/wolf.sock:/var/run/wolf/wolf.sock`. The app still uses `WOLF_SOCKET_PATH=/var/run/wolf/wolf.sock`. This is already applied on den-srv. Credentials and mutable generated config are deliberately kept on the target.

## Observed behavior

1. Host VAAPI reports H.264, HEVC, and AV1 encoding support on the RX 9070 XT. Host Vulkan lists the discrete AMD GPU separately from llvmpipe.
2. Wolf selected VA hardware encoders and its AMD zero-copy pipeline.
3. A real Wolf UI session was started through `POST /api/v1/sessions/add` without a Moonlight connection. A second session was started through Moonlight. Both ran concurrently in separate containers/displays.
4. Both Godot-based Wolf UI processes reported `Vulkan 1.4.305 - Forward+ - Using Device #0: AMD - AMD Radeon Graphics (RADV GFX1201)`.
5. Moonlight 6.1.0 on the agent computer received the 1280x720, 30 FPS H.264 stream. Its software decoder ran on a private local Xvfb display; rendering and encoding happened remotely on den-srv.
6. Keyboard input through Moonlight navigated the remote UI. A key-down/key-up pair through Wolf's `POST /api/v1/sessions/input` opened the selected application's menu, visible in the returned stream. A relative mouse packet `(200, 100)` was accepted; FPS turning and pointer-lock behavior were not tested.
7. Wolf launched its stock Firefox application in another container/compositor. Firefox's own `about:support` showed WebRender and `AMD -- AMD Radeon Graphics (radeonsi, gfx1201, LLVM 20.1.2, DRM 3.64, 6.17.13+deb13-amd64)` for WebGL 2, using Mesa 25.0.7.
8. Trial sessions and the Firefox lobby were explicitly stopped. Final API readback: zero sessions and zero lobbies. The local Moonlight/Xvfb processes were stopped. Wolf remains available for new work.
9. Frigate remained healthy and its version endpoint responded after the pilot. The pre-existing unhealthy `rpg-roleplay-platform` container was observed before the trial and was not changed.

Evidence images are captures of the remote composed output decoded by Moonlight, not direct compositor exports:

- [Remote application selection after keyboard input](evidence/wolf-ui-after-enter.png)
- [Menu opened by API keyboard input](evidence/wolf-api-input.png)
- [Firefox running remotely](evidence/wolf-firefox.png)
- [Firefox WebRender](evidence/firefox-graphics.png)
- [Firefox AMD WebGL 2 renderer](evidence/firefox-webgl2.png)

## Findings that affect the agent design

**Pass both DRM nodes to Wolf.** Initially only `/dev/dri/renderD128` was exposed. Wolf itself accelerated successfully, but it could not find the primary node and passed neither GPU device into its child UI container. That application silently used llvmpipe. Exposing `/dev/dri` fixed child-device discovery and application rendering. Verify the application's renderer, not only Wolf's encoder.

**Use exact bind mounts for state and runtime.** Wolf resolves these paths against its own Docker mounts. A parent-only runtime mount produced lookup errors. Its image startup script derives `WOLF_CFG_FILE` from `HOST_APPS_STATE_FOLDER`, so setting only `WOLF_CFG_FILE` was ineffective. The Compose file contains the verified layout.

**Capture still needs an integration.** Stable Wolf has session creation and input APIs but no screenshot API. Its frames currently stay inside compositor/GStreamer producers and the Moonlight streaming path. This pilot used an automated Moonlight client, which requires no human viewer but is still a streaming client. Direct screenshot/frame access without encoding/decoding remains future work.

**Separate session and lobby cleanup.** Stopping the streaming session left the Firefox lobby running. Explicit `POST /api/v1/lobbies/stop` removed it. A future lease release must account for both resources rather than assuming disconnect means application termination.

**Choose explicit client identities.** Anonymous session creation reused the same session ID during this pilot. Do not assume repeated anonymous `/sessions/add` calls allocate independent jobs. The concurrent test used one anonymous client and one separately paired Moonlight client. A production adapter needs explicit identities and session/lobby ownership.

**An input receipt is not visible success.** The API can acknowledge input before the keyboard/mouse is initialized. Wait for a ready display, retain action receipts, and verify effects in observations. Cancellation, bounded holds, cross-session input isolation, relative FPS controls, repeated reset behavior, and a real Rusty game still need end-to-end testing.

## Controller and next slice

The [controller](controller/README.md) implements acquire, bounded input, observe, cancellation, status, artifacts, and release using the working Moonlight capture route. Session expiry and input timing stay on den-srv; DSH stays here. Native Xbox input now drives proportional Space flight and CraftSurvive FPS controls through the remote browser; see the [accepted Xbox pilot](controller/virtual-xbox.md). Next work includes automatic application launch, explicit application/lobby ownership, and broader game interaction coverage. Direct compositor capture and genre-specific Cordis plugins remain separate additions. Completing the Den Services playtest backlog is not a prerequisite.

## Upstream references

- [Wolf quickstart](https://games-on-whales.github.io/wolf/stable/user/quickstart.html)
- [Wolf management API](https://games-on-whales.github.io/wolf/stable/dev/api.html)
- [Wolf architecture](https://games-on-whales.github.io/wolf/stable/dev/how-it-works.html)
- [Moonlight input packets](https://games-on-whales.github.io/wolf/stable/protocols/input-data.html)

Source inspection used Wolf stable `7f416ec`; this records the observation, not a version pin. The deployment follows `stable`. The downloaded Moonlight client and its disposable test configuration are under the ignored local `research/moonlight` directory.
