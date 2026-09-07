# Remaining pointer-routing issue

Observed 2026-09-07 UTC with Wolf stable, its stock Firefox application running under nested Sway, RX 9070 XT, and a 1280×720 Moonlight stream. The configured client mouse acceleration is 1.0. Keyboard navigation and Ctrl+L/typing worked before pointer clicks.

## Reproduction and evidence

Lease `68452c95-317a-4109-84ec-70c54c2f6aad` retained its full local artifacts under `controller/state/`.

1. Acquire Wolf UI, observe, use Enter to select the user, open Firefox's menu, and choose Start. Observe between transitions: stream-window availability alone does not establish application readiness.
2. On Firefox's Restore Session page, send a Wolf absolute mouse point to `(730, 555)` in the 1280×720 viewport, wait 200 ms, press/release left button over 200 ms, and observe. The streamed arrow visibly reaches Start New Session, but the button does not activate. Capture: `16f932cc-c207-49c6-9bfc-de423f75de46.png`.
3. Sway's read-only `get_tree` reports the workspace focused and Firefox unfocused. Keyboard input then has no visible effect. An ordinary Moonlight click also failed to activate the target. These observations do not establish the exact upstream defect.
4. As a diagnostic only, run `swaymsg -s /data/services/playtest-wolf/runtime/sway.socket seat seat0 cursor set 730 555` inside this disposable Firefox container. Send the unchanged Wolf click through MCP. Start New Session activates; Sway reports Firefox focused. Capture: `599839bc-2059-4f59-83d3-d02607d7d509.png`.
5. A subsequent relative move of `(-440, -495)` places the streamed arrow on Firefox's new-tab button, but clicking does not create a tab. Capture: `1f19743e-c94f-4270-9856-6842533b2e86.png`.

This separates successful button delivery from unreliable recipient pointer position. The successful diagnostic is not evidence that the normal controller point/click path works. The controller contains no Sway cursor/focus fallback. The lease, viewer, Firefox lobby, and stream were released after diagnosis.

## Owning code to investigate

- Wolf `src/moonlight-server/control/input_handler.cpp`: relative/absolute motion forwarding and viewport conversion; mouse acceleration also affects absolute coordinates.
- Wolf `src/core/src/platforms/linux/virtual-display/gst-wayland-display.cpp`: custom MouseMoveRelative, MouseMoveAbsolute, and MouseButton events; button 1 maps to Linux BTN_LEFT.
- gst-wayland-display `wayland-display-core/src/comp/input.rs`: `pointer_motion()` computes the surface under the old position before moving; the code explicitly notes ordering sensitivity with nested Sway. `pointer_button()` updates keyboard focus separately. This is a source-level suspect, not a confirmed root cause.

Wolf's inspected Docker build references gst-wayland-display `b15285a`. The inspected current upstream motion implementation is materially the same. No Wolf, Sway, GPU-driver, or DSH-core patch was made as part of this controller.

Resolve this in the Wolf/compositor integration, or deliberately introduce a separately named target input provider with its own acceptance evidence, before treating screenshot-coordinate mouse clicks or FPS look controls as reliable. Do not silently substitute a Sway command while continuing to label receipts `wolf-compositor`.
