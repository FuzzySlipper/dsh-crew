"""Explicit live MCP smoke: visible captures, cancellation, inactivity expiry."""
import asyncio
import json
from pathlib import Path
import sys
import time

from mcp import Client, StdioServerParameters


async def main():
    root = Path(__file__).resolve().parent
    params = StdioServerParameters(command=sys.executable,
                                  args=[str(root / 'server.py'), '--config', str(root / 'config.json')])
    async with Client(params, read_timeout_seconds=90) as client:
        async def call(tool, **args):
            result = await client.call_tool(tool, args)
            if result.is_error:
                raise RuntimeError(result.content)
            return json.loads(next(c.text for c in result.content if c.type == 'text')), result

        status, _ = await call('status')
        assert status['lease'] is None, 'Slot must be idle before smoke'
        acquired, _ = await call('acquire', ttl_seconds=15)
        lease = acquired['lease_id']
        directory = Path(acquired['artifact_directory'])
        print(f'ACQUIRED {lease}', flush=True)
        try:
            first, response = await call('observe', lease_id=lease)
            assert (first['width'], first['height']) == (1280, 720)
            assert any(c.type == 'image' and c.mime_type == 'image/png' for c in response.content)
            await call('input', lease_id=lease, steps=[{'kind': 'hold', 'keys': [13], 'ms': 80},
                                                      {'kind': 'wait', 'ms': 500}])
            second, _ = await call('observe', lease_id=lease)
            assert Path(first['path']).read_bytes() != Path(second['path']).read_bytes()
            print(f'CAPTURED {second["path"]}', flush=True)

            action = asyncio.create_task(call('input', lease_id=lease,
                                              steps=[{'kind': 'hold', 'keys': [16], 'ms': 8000}]))
            await asyncio.sleep(.5)
            await call('cancel', lease_id=lease)
            receipt, _ = await action
            assert receipt['cancelled'] and receipt['elapsed_ms'] < 4000 and not receipt['release_errors']
            print(f'EXPLICIT CANCEL {receipt["elapsed_ms"]} ms; released', flush=True)

            # Cancelling the MCP request must also reach the target worker.
            action = asyncio.create_task(call('input', lease_id=lease,
                                              steps=[{'kind': 'hold', 'keys': [16], 'ms': 8000}]))
            await asyncio.sleep(.5)
            action.cancel()
            try:
                await action
            except asyncio.CancelledError:
                pass
            await asyncio.sleep(.5)
            status, _ = await call('status', lease_id=lease)
            receipt = status['last_input']
            assert receipt['cancelled'] and receipt['elapsed_ms'] < 4000 and not receipt['release_errors']
            print(f'MCP CANCELLATION {receipt["elapsed_ms"]} ms; released', flush=True)

            before_size = (directory / 'events.jsonl').stat().st_size
            # No heartbeats: target sweeper must clean up despite an open MCP transport.
            deadline = time.monotonic() + 25
            while time.monotonic() < deadline:
                await asyncio.sleep(1)
                status, _ = await call('status')
                if status['lease'] is None:
                    break
            assert status['lease'] is None, status
            assert not any(s['client_id'] == acquired['session']['client_id'] for s in status['sessions'])
            assert (directory / 'events.jsonl').stat().st_size >= before_size
            print('EXPIRY cleaned target; evidence retained', flush=True)
        finally:
            released, _ = await call('release', lease_id=lease)
            assert released['released'], released
        rows = [json.loads(x) for x in (directory / 'events.jsonl').read_text().splitlines()]
        assert sum(r['event'] == 'observation' for r in rows) == 2
        print(f'PASS {len(rows)} journal records: {directory}', flush=True)


if __name__ == '__main__':
    asyncio.run(main())
