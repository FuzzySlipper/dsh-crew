# Virtual Xbox pilot

The controller now accepts native Wolf Xbox packets through `input`:

```json
{"lease_id":"<lease>","steps":[
  {"kind":"gamepad","lx":0.5,"ry":0.2,"rt":1,"buttons":["a"],"ms":500}
]}
```

Each step sets the complete simultaneous state of controller zero. Sticks are
`[-1,1]`, positive X right and positive Y up. Triggers are `[0,1]`. Buttons are
`a,b,x,y,lb,rb,ls,rs,start,back,guide,up,down,left,right`. Omitted controls are
neutral. Every step returns all controls to neutral, including cancellation
and a lost acknowledgement. Session shutdown destroys the virtual device.
The existing 10-second batch and 2-second cleanup budgets apply.

This is a real Linux uinput device created by Wolf/inputtino, identified as
Xbox One `045e:02ea`. No browser Gamepad API replacement or gameplay injection
is used. The tool can drive analog sticks even when a particular game maps
only digital buttons. It does not turn an unsupported game into a gamepad game.

## den-srv setup

- Load `uinput` (`sudo modprobe uinput`). The checked-in
  [udev rule](../85-den-playtest-wolf.rules) is installed at
  `/etc/udev/rules.d/85-den-playtest-wolf.rules`; reload rules and trigger the
  uinput device after loading the module. It permits the existing rootless
  Docker account to create controllers, and grants access specifically to
  Wolf virtual input nodes. No physical-input permissions were changed.
  `/etc/modules-load.d/den-playtest-wolf.conf` loads `uinput` on subsequent boots.
- [Compose](../compose.yaml) now passes `/dev/uinput`, mounts `/dev/input`,
  and exposes the host udev database read-only to Wolf. UHID is unnecessary
  for this Xbox test and is not exposed.
- Rootless Docker rejects Wolf's app-container `mknod` hotplug commands.
  The Firefox runner in `/data/services/playtest-wolf/cfg/config.toml` uses
  `mounts = [ '/dev/input:/dev/input:ro' ]`. Its `GOW_REQUIRED_DEVICES` excludes
  `/dev/input/*` so startup does not try to chmod read-only physical nodes.
  Wolf virtual nodes are already readable through the specific udev rule.
  The read-only mount also prevents Wolf's unplug command deleting host nodes.
- Create controller zero with a neutral `gamepad` step **before launching
  Firefox**. The browser then enumerates the existing device. Late hotplug and
  multiple controllers are not accepted by this pilot.
- The pre-change generated config is retained on den-srv as
  `cfg/config.before-xbox.toml`. Do not replace current generated config with
  that backup wholesale; it includes paired-client state.

Firefox's Gamepad API needs a secure context. The pilot runs
[`localhost-forward.py`](localhost-forward.py) inside the Firefox container,
bound to `127.0.0.1`, forwarding TCP bytes to the actual game server. For example:

```sh
python3 /tmp/localhost-forward.py --port 37301 --host 192.168.1.22 --target-port 37301
```

Navigate the remote browser to `http://localhost:37301/`. This also forwards
WebSockets without changing their contents. The helper exits with its owning
container. Use `docker exec -i ... sh -c 'cat > /tmp/localhost-forward.py'` to
install it; `docker cp` encounters a rootless read-only-remount error here.
It is pilot launch plumbing, not yet automatically installed by `acquire`.

For the current Wolf UI, acquire the default app, send a neutral gamepad step,
then use Enter to choose User, Enter to open Firefox's menu, and Enter to Start.
Observe between those actions. Install/start the forwarder in the resulting
`WolfFirefox_*` container using the rootless Docker account. Ctrl+L opens the
browser address bar; navigate to the localhost port matching the test runtime.
F6 followed by Tab placed focus on the Engine canvas in the accepted test.

The Firefox runner now uses `den-playtest-firefox:local`, built from
[`Dockerfile.firefox`](../Dockerfile.firefox). The Wolf base image had Firefox
150.0.3: its Linux implementation exposed LT/RT as extra axes, leaving standard
trigger buttons 6/7 inactive. The pilot image upgrades Firefox through its
configured Mozilla apt repository (155.0.1 during this test). The newer Linux
backend maps those axes to the standard analog trigger buttons. This is a
browser upgrade, not a game-specific input translation.

Build/update it on den-srv with the usual rootless Docker command prefix:

```sh
docker build --no-cache -t den-playtest-firefox:local - < Dockerfile.firefox
```

## Current Space and CraftSurvive runtime

Both actual demos now use SDK `0.1.0-dev.2574cc89fd30.gamepad1` and their
installed `.runtime/runtime-pack-2574cc89fd30-gamepad2` development runtime:
Space at `http://192.168.1.22:37301/`, CraftSurvive at
`http://192.168.1.22:37300/`. Their Den manifests retain those ports.
Build the SDK before the runtime: SDK generation updates the Rust ABI identity.
These are local contributor artifacts, not a published Engine release.

Engine owns controller selection, proportional button-value ingress, and the
Firefox AudioListener compatibility path. C# products own mappings and deadzones;
neither DOM UI polls gamepads or emulates mouse movement.

## Analog Space and FPS acceptance, 2026-09-07

The [evidence index](evidence/analog-fps/index.json) links the native session
journal, screenshots, read-only C# readouts, and Engine health captures.

- Space RT 0.25 and 0.75 for 1.5 seconds after reset produced speeds 2.6 and
  4.5. Left-stick X 0.35 and 0.85 for 0.8 seconds produced headings 20 and
  69 degrees; 0.1 remained at zero inside the 15% deadzone.
- CraftSurvive right-stick X 0.4 and 0.8 for one second turned roughly 29 and
  92 degrees. Upward stick input raised pitch. Left-stick input 0.45 and 0.85
  produced movement intents 0.353 and 0.823 after deadzone remapping.
- Native A jumped, B crouched, and LS sprinted. Release returned movement and
  buttons to neutral; look stopped drifting. Look integrates admitted simulation
  time at a maximum 108 degrees/second, independently of mouse sensitivity.
- RT and LT reached terrain interaction but returned `cast-miss`: successful
  terrain edits are not certified. X impulse has focused input-test coverage,
  not native acceptance in this run.
- Both Engine diagnostic streams reported zero warnings, errors, and dropped
  events. These are not browser-console warning deltas or frame-pacing checks.

Actions use wall-clock durations. Space gravity and Craft wall collisions mean
these are control-response checks, not deterministic distance/speed benchmarks.
See [CraftSurvive's report](/home/dev/rusty-craftsurvive/docs/controller-playtest.md)
for controls and limits. The remote lease was released; no virtual controllers,
Wolf sessions, or lobbies remained. The two local demos remain running.

## Earlier digital Space pilot

Native Wolf Xbox input drove Rusty Space through Firefox 155 and the final
Engine development pack, without browser input injection:

- RB + RT for 1.5 seconds: [heading 157 degrees](evidence/xbox-game-right.png).
- Back: [heading 0 degrees, speed 0.2](evidence/xbox-game-reset.png).
- RT for 2 seconds: [heading 0 degrees, speed 10.2](evidence/xbox-game-thrust.png).
- LB for 0.75 seconds: [heading 290 degrees](evidence/xbox-game-left.png).
- [Runtime diagnostics](evidence/xbox-game-runtime-health.json): no warnings or
  errors and a live output subscriber during the final test.
- [Final action/observation journal](evidence/xbox-game-session-events.jsonl)
  retains timestamps and original artifact paths. This is a realtime test;
  action durations are wall-clock durations, not deterministic simulation ticks.

Firefox exposed an unrelated Engine audio bug: the listener code assumed
AudioParam properties that Firefox does not implement. Listener synchronization
threw, degraded the audio host, and then terminated browser presentation and
input. The [observed failure](evidence/firefox-audio-failure.png) led to an
Engine-owned method-based AudioListener path, following Firefox's
[documented API](https://developer.mozilla.org/en-US/docs/Web/API/AudioListener).
The 125 renderer-host tests pass, including repeated listener synchronization
through the presentation host set. No audio playback acceptance is claimed.

Use native keyboard F6/Tab navigation to place focus on the canvas before
controller actions. Controller discovery alone does not grant gameplay focus.
The capture bridge also resolves Moonlight's current window on each observation:
SDL may replace its initial video window during decoder startup.

## Device and lifecycle evidence

- [Firefox detection](evidence/xbox-browser-detected.png): actual
  `navigator.getGamepads()[0].id`, observed through the remote stream.
- [Firefox 155 RT value](evidence/xbox-firefox155-trigger.png): a timed read of
  `navigator.getGamepads()[0].buttons[7].value` returned `1` during a real RT
  hold. The same focused-tab diagnostic returned `0` on Firefox 150.
- [Held device state](evidence/xbox-device-held.json): four independent axes,
  two triggers, and simultaneous A/LB measured with Linux evdev ioctls.
- [Timed return to neutral](evidence/xbox-device-neutral.json).
- [Cancelled return to neutral](evidence/xbox-device-cancelled.json): the
  eight-second action was cancelled after about 1.16 seconds; all axes,
  triggers, and buttons were neutral afterward.
- [Session release](evidence/xbox-device-released.json): the device disappeared
  after its owning session stopped.
- [Final release](evidence/xbox-final-device-released.json): no virtual devices
  remained after the accepted game session. The DSH interoperability check then
  read zero Wolf sessions and zero lobbies and unloaded successfully.

`gamepad-device-probe.py` reads actual kernel state and does not inject events.
Linux evdev's vertical-axis convention is downward-positive; Wolf converts
the tool's upward-positive values, so their signs differ in that evidence.

Acceptance is limited to one controller created before browser launch. Space
analog flight and CraftSurvive FPS sticks are now covered above. Late hotplug,
multiple controllers, mouse targeting, audio capture, and automatic game
launch/localhost forwarding remain unaccepted or separate work.

Protocol references: [Wolf input packets](https://games-on-whales.github.io/wolf/stable/protocols/input-data.html),
[Moonlight implementation](https://github.com/moonlight-stream/moonlight-common-c/blob/master/src/InputStream.c),
[Mozilla secure-context requirement](https://hacks.mozilla.org/2020/07/securing-gamepad-api/).
