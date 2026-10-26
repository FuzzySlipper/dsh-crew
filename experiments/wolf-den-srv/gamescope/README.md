# Gamescope pointer experiment — 2026-09-08

**Superseded by the [refinement and default rollout](refinement-2026-09-08.md).**
Gamescope/XWayland kiosk Firefox is now the default Go playtest path. The first
movement jump was resolved through Firefox's recentering preference; window
sizing and navigation were resolved with forced sizing and kiosk startup.
The remainder of this document records the initial experiment.

Gamescope materially improves native mouse usability in this bounded test.
It is a candidate compositor profile, not the production default.

## Configuration tested

On den-srv, use the existing `den-playtest-firefox:local` image, stock
Games-on-Whales Gamescope launcher, and a separate Firefox home:
`playtest/gamescope/WolfFirefox`.

- Remove `RUN_SWAY`; set `RUN_GAMESCOPE=1`.
- Set `MOZ_ENABLE_WAYLAND=0` so Firefox uses Gamescope's XWayland.
- Leave stock Gamescope mode (`-b`) and Wolf mouse acceleration unchanged.
- Stream: 1280 × 720 at 30 Hz, RX 9070 XT.
- No Wolf configuration file changes or game source changes were made.

Official compositor configuration:
https://games-on-whales.github.io/wolf/stable/user/configuration.html#_set_window_compositor

`launch.py` runs on den-srv after acquiring a supervised Wolf lease and
connecting the configured Moonlight client. It creates and joins a disposable
lobby, using explicit DMABuf capabilities verified for this installation.
It is machine-specific experimental tooling, not a general session launcher.
The caller must release the lease and verify the created lobby is removed.
Do not use concurrently with another playtest lease.

Prepare the separate home with ownership inside the rootless Docker mapping.
On this host the daemon owner is docker-rt:den-pi-docker (995:985); container
retro maps to 166535. Root-owned host directories caused provisioning failures
before Gamescope started. Those failures are not compositor test results.

## Results

1. **Absolute click grid: 9/9 correct trusted DOM targets.**
   Native Wolf point/click commands jumped among A, I, E, C, G, B, F, D, H.
   Requested stream centers were (188,242), (532,514), (360,378),
   (532,242), (188,514), (360,242), (532,378), (188,378), (360,514).
   Browser coordinates account for the roughly 85–86 px browser chrome offset.
   No Sway cursor-set command, DOM injection, or synthetic click was used.
2. **Pointer lock acquired through native click.**
   The fixture reported a trusted button click followed by locked=true.
   Subsequent relative movements matched requested deltas, including
   (0,60), (-100,-60), (100,0), and (20,0).
3. **Pointer-lock transition has a repeatable jump.**
   First request (100,0) after clicking Lock produced (401,-195).
   After Escape and native L to relock, first request (20,0) produced
   (421,-195), then the next (20,0) was correct. Cause is unconfirmed.
   Do not silently subtract a presumed offset or discard real gameplay input.
4. **CraftSurvive visibly responds to relative mouse look.**
   Loaded the existing demo through a loopback forwarder to
   192.168.1.22:37300, clicked the scene, then used native Wolf movement.
   A sequence of 30 × (30,0), 40 ms apart, visibly rotated the scene.
   A sequence of 20 × (0,-20), 40 ms apart, visibly pitched toward the ceiling.
   Evidence establishes visible response, not calibrated turn angles or
   game-owned pointer-lock state. The fixture independently verifies lock.
5. **Browser presentation/focus needs refinement.**
   The captured browser chrome retained the prior fixture title/URL even when
   CraftSurvive rendered underneath. The content occupied 1162 × 573 within
   the 1280 × 720 stream. F11 did not yield a clean full-viewport result.
   Keyboard navigation needed an explicit address-bar click and settle time.
   Do not infer current URL from that stale chrome or equate transport
   connection with browser readiness.

## Evidence

`evidence/fixture-events.json` contains trusted browser event readback.
`*-input.json` files contain native command receipts, separate from effects.
PNG files and matching capture metadata preserve the grid and game observations.
Compare `craft-look1.png` → `craft-sweep.png` → `craft-pitch-sweep.png`.
Capture freshness is not measured; repeated visible changes are the bounded
evidence, not a frame-identity guarantee.

The Python fixture server is disposable test instrumentation, not a proposed
replacement for the Go service. Run `python3 fixture-server.py --events PATH`
on the harness host (port 37309), and forward that port into the game container.
The page logs trusted input and exposes a native-click or L-key lock trigger.

## Integration recommendation

Keep this as an optional Gamescope/XWayland profile while investigating
pointer-lock transitions and browser sizing/focus. The current production
launcher explicitly checks Sway's window tree; supporting Gamescope requires
a compositor-specific readiness probe, not bypassing readiness checks.

A focused next experiment could compare cursor-grab behavior and centering
before lock acquisition, measuring the same trusted deltas. The stock launcher
quotes GAMESCOPE_MODE as a single argument: do not put multiple flags in it.
Neither --force-grab-cursor nor native-Wayland Firefox was tested here.

Cleanup succeeded: the owned lease and capture were released without errors,
the Gamescope container disappeared, temporary probe/fixture services stopped,
and crew-playtest.service was restarted and confirmed active. The normal
Sway configuration remains in place; game servers were left running.
