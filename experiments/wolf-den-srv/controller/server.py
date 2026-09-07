"""MCP tools for one remote playtest slot; runnable through DSH's MCP plugin."""
import argparse
import base64
from contextlib import asynccontextmanager
import json
from pathlib import Path
import subprocess

import anyio
from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError
from mcp.types import CallToolResult, ImageContent, TextContent
from pydantic import BaseModel, Field
from typing import Literal

from bridge import Bridge


class Step(BaseModel):
    kind: Literal['hold', 'move', 'point', 'click', 'wait', 'gamepad']
    ms: int = Field(default=0, ge=0, le=10000)
    keys: list[int] | None = None
    dx: int | None = None
    dy: int | None = None
    x: int | None = None
    y: int | None = None
    width: int | None = None
    height: int | None = None
    button: int = Field(default=1, ge=1, le=3)
    buttons: list[Literal['up', 'down', 'left', 'right', 'start', 'back',
                          'ls', 'rs', 'lb', 'rb', 'guide', 'a', 'b', 'x', 'y']] | None = None
    lx: float = Field(default=0, ge=-1, le=1)
    ly: float = Field(default=0, ge=-1, le=1)
    rx: float = Field(default=0, ge=-1, le=1)
    ry: float = Field(default=0, ge=-1, le=1)
    lt: float = Field(default=0, ge=0, le=1)
    rt: float = Field(default=0, ge=0, le=1)


def build(config):
    bridge = Bridge(config)

    async def invoke(fn, *args, abandon_on_cancel=False):
        try:
            return await anyio.to_thread.run_sync(fn, *args, abandon_on_cancel=abandon_on_cancel)
        except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
            raise ToolError(str(error)) from error

    @asynccontextmanager
    async def lifespan(_):
        try:
            yield
        finally:
            with anyio.CancelScope(shield=True):
                await anyio.to_thread.run_sync(bridge.close)

    mcp = MCPServer('wolf-playtest', lifespan=lifespan,
                    instructions='Acquire one lease, observe the visible game, send bounded input, '
                    'observe effects, and release. API receipts do not prove gameplay success. '
                    'Screenshots have capture timestamps but no game frame/freshness guarantee.')

    @mcp.tool()
    async def acquire(app: str = 'Wolf UI', width: int = 1280, height: int = 720,
                      fps: int = 30, ttl_seconds: int = 300) -> dict:
        """Acquire the exclusive remote slot and connect a private stream viewer.

        App is a Moonlight app name (Wolf UI or Testball in this pilot). Returns
        lease_id. Observe before acting; a stream window is not game readiness.
        Tools renew inactivity expiry; release explicitly when finished.
        """
        return await invoke(bridge.acquire, app, width, height, fps, ttl_seconds)

    @mcp.tool(structured_output=False)
    async def observe(lease_id: str) -> CallToolResult:
        """Capture the decoded remote stream as a PNG and return image plus artifact metadata."""
        metadata, path = await invoke(bridge.observe, lease_id)
        return CallToolResult(content=[TextContent(type='text', text=json.dumps(metadata)),
                                      ImageContent(type='image', mime_type='image/png',
                                                   data=base64.b64encode(path.read_bytes()).decode())])

    @mcp.tool(structured_output=False)
    async def input(lease_id: str, steps: list[Step]) -> CallToolResult:
        """Execute a batch with a 10-second input budget and 2-second key-up budget.

        hold: keys are Windows virtual-key integers (W=87, Enter=13, Ctrl=17,
        Shift=16, arrows=37..40); ms is hold duration. move: relative dx/dy;
        point: absolute x/y in width/height viewport; click: button 1/2/3 and ms;
        wait: ms. Steps run in order. Chords use one hold with multiple keys.
        gamepad: virtual Xbox slot 0; lx/ly/rx/ry in [-1,1], positive X right,
        positive Y up; lt/rt in [0,1]; buttons are Xbox names (a,b,x,y,lb,rb,
        ls,rs,start,back,guide,up,down,left,right). State is simultaneous for ms,
        then every stick, trigger and button returns to neutral, also on cancel.
        For moving while turning, use repeated short holds/moves in a batch.
        Returns delivery receipts, not a game verdict. Cancellation requests key release.
        Failed key-up delivery triggers session shutdown; inspect release_errors.
        Mouse targeting is experimental: the streamed cursor can disagree with
        nested Sway's recipient cursor. Do not assume a point/click reaches its
        visible target; inspect observations. Keyboard navigation is verified.
        """
        try:
            result = await invoke(
                bridge.input, lease_id, [s.model_dump(exclude_none=True, exclude_defaults=True) for s in steps],
                abandon_on_cancel=True)
        except anyio.get_cancelled_exc_class():
            with anyio.CancelScope(shield=True):
                await anyio.to_thread.run_sync(bridge.cancel, lease_id)
            raise
        return CallToolResult(content=[TextContent(type='text', text=json.dumps(result))],
                              is_error=bool(result.get('error') or result.get('release_errors')))

    @mcp.tool()
    async def cancel(lease_id: str) -> dict:
        """Interrupt a running input batch. Its target worker releases controls."""
        return await invoke(bridge.cancel, lease_id)

    @mcp.tool()
    async def status(lease_id: str | None = None) -> dict:
        """Read target session/lobby/lease state. Supplying our lease renews inactivity expiry."""
        return await invoke(bridge.status, lease_id)

    @mcp.tool()
    async def release(lease_id: str) -> dict:
        """Release controls, stop owned session/lobbies and private viewer; retain evidence."""
        return await invoke(bridge.release, lease_id)

    return mcp


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--config', required=True)
    args = parser.parse_args()
    build(json.loads(Path(args.config).read_text())).run()
