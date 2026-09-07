"""Target-local Wolf lease and bounded input service. Standard library only."""
import argparse
import http.client
import json
import math
import os
from pathlib import Path
import signal
import socket
import struct
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def utc():
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


class Wolf:
    def __init__(self, path):
        self.path = path

    def call(self, route, data=None, timeout=5):
        conn = http.client.HTTPConnection('localhost', timeout=timeout)
        conn.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        conn.sock.settimeout(timeout)
        try:
            conn.sock.connect(self.path)
            conn.request('GET' if data is None else 'POST', '/api/v1/' + route,
                         None if data is None else json.dumps(data),
                         {'Content-Type': 'application/json'})
            response = conn.getresponse()
            result = json.loads(response.read())
            if response.status != 200 or not result.get('success'):
                raise RuntimeError(f'Wolf {route}: {result.get("error", response.status)}')
            return result
        finally:
            conn.close()


def packet(kind, payload):
    body = struct.pack('<I', kind) + payload
    return (struct.pack('<HH', 0x0206, len(body) + 4) +
            struct.pack('>I', len(body)) + body).hex()


def key_packet(key, down):
    return packet(3 if down else 4, struct.pack('<BHBH', 0, key, 0, 0))


GAMEPAD_BUTTONS = dict(up=1, down=2, left=4, right=8, start=16, back=32,
                      ls=64, rs=128, lb=256, rb=512, guide=1024,
                      a=4096, b=8192, x=16384, y=32768)


def gamepad_packet(step=None, connected=True):
    """Moonlight multi-controller packet; slot zero, positive Y means stick up."""
    step = step or {}
    buttons = 0
    for name in step.get('buttons', []):
        buttons |= GAMEPAD_BUTTONS[name]
    axes = [round(step.get(name, 0) * 32767) for name in ('lx', 'ly', 'rx', 'ry')]
    triggers = [round(step.get(name, 0) * 255) for name in ('lt', 'rt')]
    return packet(12, struct.pack('<HHHHHBBhhhhHHH', 0x1a, 0, int(connected),
                                  0x14, buttons, *triggers, *axes, 0x9c, 0, 0x55))


def integer(value, low, high, name):
    if type(value) is not int or not low <= value <= high:
        raise ValueError(f'{name} must be an integer in [{low}, {high}]')
    return value


def validate_steps(steps):
    """Validate the whole batch before delivering any input."""
    if not isinstance(steps, list) or not 1 <= len(steps) <= 100:
        raise ValueError('Provide 1..100 steps')
    total = 0
    for step in steps:
        kind = step['kind']
        if kind not in ('hold', 'move', 'point', 'click', 'wait', 'gamepad'):
            raise ValueError('Unknown input kind')
        duration = integer(step.get('ms', 0), 0, 10000, 'ms')
        total += duration
        if kind == 'hold':
            keys = step.get('keys', [])
            if not isinstance(keys, list) or not 1 <= len(keys) <= 8:
                raise ValueError('hold needs 1..8 Windows virtual-key codes')
            for key in keys:
                integer(key, 1, 255, 'key')
        elif kind == 'move':
            for field in ('dx', 'dy'):
                integer(step[field], -32768, 32767, field)
        elif kind == 'point':
            for field in ('width', 'height'):
                integer(step[field], 1, 16384, field)
            integer(step['x'], 0, step['width'] - 1, 'x')
            integer(step['y'], 0, step['height'] - 1, 'y')
        elif kind == 'click':
            integer(step.get('button', 1), 1, 3, 'button')
        elif kind == 'gamepad':
            buttons = step.get('buttons', [])
            if not isinstance(buttons, list) or any(b not in GAMEPAD_BUTTONS for b in buttons):
                raise ValueError('Unknown Xbox button')
            for field in ('lx', 'ly', 'rx', 'ry', 'lt', 'rt'):
                value = step.get(field, 0)
                low = 0 if field in ('lt', 'rt') else -1
                if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= 1:
                    raise ValueError(f'{field} must be finite in [{low}, 1]')
    if total > 10000:
        raise ValueError('A batch may last at most 10000 ms')


class Controller:
    def __init__(self, wolf, state, client_id):
        self.wolf, self.state, self.client_id = wolf, Path(state), client_id
        self.state.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.action_lock = threading.Lock()
        self.cancel = threading.Event()
        self.lease = None
        self.last_release = None
        self.last_input = None
        self.active_action = None
        self.cancelled_actions = set()
        saved = self.state / 'lease.json'
        if saved.exists():
            self.lease = json.loads(saved.read_text())
            if self.lease:
                self.lease['expires_at'] = 0  # Restart never resumes unattended input.

    def save(self):
        temp = self.state / 'lease.tmp'
        with temp.open('w') as out:
            json.dump(self.lease, out)
            out.flush()
            os.fsync(out.fileno())
        temp.replace(self.state / 'lease.json')

    def record(self, event):
        with (self.state / 'events.jsonl').open('a') as out:
            out.write(json.dumps({'time': utc(), **event}) + '\n')
            out.flush()
            os.fsync(out.fileno())

    def snapshot(self):
        sessions = self.wolf.call('sessions')['sessions']
        lobbies = self.wolf.call('lobbies')['lobbies']
        if self.lease:
            owned = set(self.lease['lobbies'])
            for lobby in lobbies:
                if (self.client_id in lobby['connected_sessions'] and
                        lobby['id'] not in self.lease['baseline_lobbies']):
                    owned.add(lobby['id'])
            if owned != set(self.lease['lobbies']):
                self.lease['lobbies'] = sorted(owned)
                self.save()
        # Never export stream AES material.
        return ([{k: s.get(k) for k in ('client_id', 'app_id', 'video_width',
                    'video_height', 'video_refresh_rate')} for s in sessions],
                [{k: l[k] for k in ('id', 'name', 'connected_sessions')} for l in lobbies])

    def require(self, lease_id, renew=True):
        if not self.lease or self.lease['id'] != lease_id:
            raise ValueError('Unknown or released lease')
        if self.lease['expires_at'] <= time.time() or self.lease.get('closing'):
            raise ValueError('Lease expired or closing; acquire a new lease after cleanup')
        if renew:
            self.lease['expires_at'] = time.time() + self.lease['ttl_seconds']
            self.save()

    def dispatch(self, request):
        operation = request['op']
        if operation == 'input':
            return self.input(request['lease_id'], request['steps'], request.get('action_id'))
        if operation == 'release':
            return self.release(request['lease_id'], 'requested')
        with self.lock:
            if operation == 'acquire':
                if self.lease:
                    raise ValueError('Playtest slot busy or awaiting cleanup')
                ttl = integer(request.get('ttl_seconds', 300), 15, 1800, 'ttl_seconds')
                sessions, lobbies = self.snapshot()
                if any(s['client_id'] == self.client_id for s in sessions):
                    raise ValueError('Configured Moonlight identity is already streaming')
                clients = self.wolf.call('clients')['clients']
                if not any(c['client_id'] == self.client_id for c in clients):
                    raise ValueError('Configured Moonlight identity is not paired')
                self.lease = dict(id=str(uuid.uuid4()), client_id=self.client_id,
                                  ttl_seconds=ttl, expires_at=time.time() + ttl,
                                  baseline_lobbies=[l['id'] for l in lobbies], lobbies=[])
                self.cancel.clear()
                self.cancelled_actions.clear()
                self.save()
                self.record({'event': 'acquire', 'lease_id': self.lease['id']})
                return dict(self.lease)
            if operation == 'status':
                if request.get('lease_id'):
                    self.require(request['lease_id'])
                sessions, lobbies = self.snapshot()
                return dict(lease=self.lease, sessions=sessions, lobbies=lobbies,
                            last_release=self.last_release, last_input=self.last_input,
                            target_time=utc())
            if operation == 'cancel':
                self.require(request['lease_id'])
                action_id = request.get('action_id') or self.active_action
                if action_id:
                    # Remember cancellation even when its SSH request arrives before input.
                    self.cancelled_actions.add(action_id)
                    if action_id == self.active_action:
                        self.cancel.set()
                return {'cancel_requested': bool(action_id), 'action_id': action_id}
            raise ValueError('Unknown operation')

    def send(self, value, deadline):
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError('Input delivery budget exhausted')
        self.wolf.call('sessions/input', {'session_id': self.client_id,
                                        'input_packet_hex': value}, timeout=min(1, remaining))

    def input(self, lease_id, steps, action_id=None):
        validate_steps(steps)
        action_id = action_id or str(uuid.uuid4())
        with self.lock:
            self.require(lease_id)
            if not self.action_lock.acquire(blocking=False):
                raise ValueError('Input batch already running')
            self.active_action = action_id
            self.cancel = threading.Event()
            if action_id in self.cancelled_actions:
                self.cancel.set()
        held_keys, held_buttons = set(), set()
        gamepad_active = False
        receipt = {'event': 'input', 'lease_id': lease_id, 'action_id': action_id,
                   'started_at': utc(), 'backend': 'wolf-input-api', 'steps': steps,
                   'completed_steps': 0, 'release_errors': []}
        started = time.monotonic()
        deadline = started + 10
        try:
            sessions = self.wolf.call('sessions', timeout=1)['sessions']
            if not any(s['client_id'] == self.client_id for s in sessions):
                raise ValueError('Stream session has not connected')
            for step in steps:
                if self.cancel.is_set():
                    break
                kind = step['kind']
                if kind == 'hold':
                    for key in step['keys']:
                        held_keys.add(key)  # Release even if the down acknowledgement is lost.
                        self.send(key_packet(key, True), deadline)
                elif kind == 'move':
                    self.send(packet(7, struct.pack('>hh', step['dx'], step['dy'])), deadline)
                elif kind == 'point':
                    self.send(packet(5, struct.pack('>hhhhh', step['x'], step['y'], 0,
                                                   step['width'], step['height'])), deadline)
                elif kind == 'click':
                    button = step.get('button', 1)
                    held_buttons.add(button)
                    self.send(packet(8, bytes([button])), deadline)
                elif kind == 'gamepad':
                    gamepad_active = True  # Neutralize even if the acknowledgement is lost.
                    with self.lock:
                        self.lease['gamepad'] = True
                        self.save()
                    self.send(gamepad_packet(step), deadline)
                self.cancel.wait(max(0, min(step.get('ms', 0) / 1000,
                                           deadline - time.monotonic())))
                for key in list(held_keys):
                    self.send(key_packet(key, False), deadline + 2)
                    held_keys.remove(key)
                for button in list(held_buttons):
                    self.send(packet(9, bytes([button])), deadline + 2)
                    held_buttons.remove(button)
                if gamepad_active:
                    self.send(gamepad_packet(), deadline + 2)
                    gamepad_active = False
                receipt['completed_steps'] += 1
        except Exception as error:
            receipt['error'] = str(error)
        finally:
            cleanup_deadline = deadline + 2
            for value in ([key_packet(k, False) for k in held_keys] +
                          [packet(9, bytes([b])) for b in held_buttons] +
                          ([gamepad_packet()] if gamepad_active else [])):
                try:
                    self.send(value, cleanup_deadline)
                except Exception as error:
                    receipt['release_errors'].append(str(error))
            receipt.update(cancelled=self.cancel.is_set(), ended_at=utc(),
                           elapsed_ms=round((time.monotonic() - started) * 1000))
            try:
                with self.lock:
                    self.active_action = None
                    self.cancelled_actions.discard(action_id)
                    self.last_input = receipt
                    if receipt['release_errors'] and self.lease:
                        self.lease['closing'] = True
                    self.record(receipt)
            finally:
                self.action_lock.release()
        if receipt['release_errors']:
            self.release(lease_id, 'input release failed')
        return receipt

    def release(self, lease_id, reason):
        with self.lock:
            if not self.lease:
                return {'released': True, 'already_released': True}
            if self.lease['id'] != lease_id:
                raise ValueError('Cannot release another lease')
            self.lease['closing'] = True
            self.save()
            self.cancel.set()
        # Input observes cancellation and releases before the session disappears.
        with self.action_lock, self.lock:
            if not self.lease:
                return {'released': True, 'already_released': True}
            if self.lease['id'] != lease_id:
                raise ValueError('Cannot release another lease')
            errors = []
            try:
                sessions, lobbies = self.snapshot()
                if (self.lease.get('gamepad') and
                        any(s['client_id'] == self.client_id for s in sessions)):
                    try:
                        self.send(gamepad_packet(), time.monotonic() + 2)
                    except Exception as error:
                        # Still stop the owning session, which destroys its virtual device.
                        errors.append(f'Gamepad neutral delivery: {error}')
                for lobby in lobbies:
                    if lobby['id'] in self.lease['lobbies']:
                        others = set(lobby['connected_sessions']) - {self.client_id}
                        if others:
                            errors.append(f'Lobby {lobby["id"]} has other clients; retained')
                        else:
                            self.wolf.call('lobbies/stop', {'lobby_id': lobby['id']})
                if any(s['client_id'] == self.client_id for s in sessions):
                    # Lobby shutdown can already have ended our session.
                    if any(s['client_id'] == self.client_id
                           for s in self.wolf.call('sessions')['sessions']):
                        self.wolf.call('sessions/stop', {'session_id': self.client_id})
                sessions, lobbies = self.snapshot()
                if any(s['client_id'] == self.client_id for s in sessions):
                    errors.append('Session still present')
                remaining = set(self.lease['lobbies']) & {l['id'] for l in lobbies}
                if remaining:
                    errors.append(f'Lobbies still present: {sorted(remaining)}')
            except Exception as error:
                errors.append(str(error))
            result = dict(event='release', lease_id=lease_id, reason=reason,
                          released=not errors, errors=errors, time=utc())
            self.last_release = result
            if not errors:
                self.lease = None
            self.save()
            self.record(result)
            return result

    def sweep(self):
        with self.lock:
            if not self.lease:
                return
            if self.lease['expires_at'] > time.time() and not self.lease.get('closing'):
                self.snapshot()
                return
            lease_id = self.lease['id']
        self.release(lease_id, 'expired or recovering')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--socket', required=True)
    parser.add_argument('--state', required=True)
    parser.add_argument('--client-id', required=True)
    parser.add_argument('--port', type=int, default=48190)
    args = parser.parse_args()
    controller = Controller(Wolf(args.socket), args.state, args.client_id)

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            try:
                if self.path != '/command':
                    raise ValueError('Unknown route')
                length = integer(int(self.headers.get('Content-Length', 0)), 1, 65536, 'body size')
                result = controller.dispatch(json.loads(self.rfile.read(length)))
                response, code = {'ok': True, 'result': result}, 200
            except Exception as error:
                response, code = {'ok': False, 'error': str(error)}, 400
            data = json.dumps(response).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            try:
                self.wfile.write(data)
            except (BrokenPipeError, ConnectionResetError):
                pass  # The input timer and release completed independently of the caller.

        def log_message(self, *_):
            pass  # Operation receipts are persisted without HTTP body/stream secrets.

    stop = threading.Event()

    def sweep():
        while not stop.wait(1):
            try:
                controller.sweep()
            except Exception as error:
                print(f'Lease cleanup pending: {error}', flush=True)

    threading.Thread(target=sweep, daemon=True).start()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)

    def shutdown(*_):
        stop.set()
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)
    try:
        server.serve_forever()
    finally:
        if controller.lease:
            controller.release(controller.lease['id'], 'service shutdown')
        server.server_close()


if __name__ == '__main__':
    main()
