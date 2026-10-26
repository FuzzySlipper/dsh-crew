#!/usr/bin/env python3
"""Serve the native-input pointer fixture and append its same-origin evidence."""

from __future__ import annotations

import argparse
import json
import threading
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


MAX_EVENT_BYTES = 1 << 20


class FixtureServer(BaseHTTPRequestHandler):
    """A deliberately narrow server: one page, event append, and event readback."""

    fixture: bytes
    events_path: Path
    events_lock: threading.Lock

    def do_GET(self) -> None:  # noqa: N802
        if self.path in ("/", "/fixture.html"):
            self._send(HTTPStatus.OK, "text/html; charset=utf-8", self.fixture)
            return
        if self.path == "/events":
            self._send(HTTPStatus.OK, "application/json; charset=utf-8", self._read_events())
            return
        self._send(HTTPStatus.NOT_FOUND, "text/plain; charset=utf-8", b"not found\n")

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/events":
            self._send(HTTPStatus.NOT_FOUND, "text/plain; charset=utf-8", b"not found\n")
            return
        length = self.headers.get("Content-Length")
        if length is None:
            self._send(HTTPStatus.LENGTH_REQUIRED, "application/json", b'{"error":"Content-Length required"}\n')
            return
        try:
            size = int(length)
        except ValueError:
            self._send(HTTPStatus.BAD_REQUEST, "application/json", b'{"error":"invalid Content-Length"}\n')
            return
        if not 1 <= size <= MAX_EVENT_BYTES:
            self._send(HTTPStatus.REQUEST_ENTITY_TOO_LARGE, "application/json", b'{"error":"event batch size rejected"}\n')
            return
        try:
            body = json.loads(self.rfile.read(size))
        except json.JSONDecodeError:
            self._send(HTTPStatus.BAD_REQUEST, "application/json", b'{"error":"invalid JSON"}\n')
            return
        if not isinstance(body, dict) or not isinstance(body.get("events"), list):
            self._send(HTTPStatus.BAD_REQUEST, "application/json", b'{"error":"events array required"}\n')
            return
        record = {
            "received_at": datetime.now(timezone.utc).isoformat(),
            "remote": self.client_address[0],
            "events": body["events"],
        }
        payload = (json.dumps(record, separators=(",", ":")) + "\n").encode()
        with self.events_lock:
            with self.events_path.open("ab") as output:
                output.write(payload)
                output.flush()
        self._send(HTTPStatus.ACCEPTED, "application/json", b'{"ok":true}\n')

    def _read_events(self) -> bytes:
        with self.events_lock:
            if not self.events_path.exists():
                records: list[object] = []
            else:
                records = [json.loads(line) for line in self.events_path.read_text(encoding="utf-8").splitlines() if line]
        return (json.dumps({"batches": records}) + "\n").encode()

    def _send(self, status: HTTPStatus, content_type: str, body: bytes) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--events", type=Path, default=Path("pointer-events.jsonl"), help="append-only JSONL evidence path")
    args = parser.parse_args()
    fixture_path = Path(__file__).with_name("fixture.html")
    FixtureServer.fixture = fixture_path.read_bytes()
    FixtureServer.events_path = args.events
    FixtureServer.events_lock = threading.Lock()
    args.events.parent.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer(("0.0.0.0", 37309), FixtureServer)
    print(f"pointer fixture on http://0.0.0.0:37309; events append to {args.events}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
