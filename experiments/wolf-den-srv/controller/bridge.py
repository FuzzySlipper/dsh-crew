"""Agent-side capture coordinator. The target owns timers and session cleanup."""
import fcntl
import json
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import threading
import time
import uuid


def run(argv, **kwargs):
    return subprocess.run(argv, check=True, capture_output=True, text=True,
                          timeout=30, **kwargs).stdout.strip()


class Bridge:
    def __init__(self, config):
        self.config = config
        self.state = Path(config['state']).resolve()
        self.state.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.state.chmod(0o700)  # Moonlight debug logs contain pairing/stream credentials.
        self.guard = (self.state / 'controller.lock').open('a')
        fcntl.flock(self.guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
        self.lock = threading.RLock()
        self.journal_lock = threading.Lock()
        self.lease = None
        self.directory = None
        self.xvfb = self.moonlight = None
        self.window = None
        self.env = None
        self.active_action = None
        self.stopped = threading.Event()
        self.watcher = threading.Thread(target=self.watch, daemon=True)
        self.watcher.start()

    def watch(self):
        while not self.stopped.wait(2):
            with self.lock:
                if self.lease and self.moonlight and self.moonlight.poll() is not None:
                    # A target expiry/disconnect ends Moonlight; retire its private X server too.
                    self.release(self.lease['id'])

    def remote(self, op, **args):
        request = json.dumps({'op': op, **args})
        # JSON goes over stdin, never through a shell command interpolation.
        result = run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5',
                      self.config['ssh_host'], 'curl', '-sS', '--max-time', '25',
                      '-H', 'Content-Type:application/json', '--data-binary', '@-',
                      f'http://127.0.0.1:{int(self.config["target_port"])}/command'],
                     input=request)
        response = json.loads(result)
        if not response['ok']:
            raise RuntimeError(response['error'])
        return response['result']

    def journal(self, event, directory=None):
        directory = directory or self.directory
        if directory is None:
            return
        with self.journal_lock, (directory / 'events.jsonl').open('a') as out:
            out.write(json.dumps({'recorded_at_ns': time.time_ns(), **event}) + '\n')
            out.flush()
            os.fsync(out.fileno())

    def spawn(self, argv, log, **kwargs):
        with (self.directory / log).open('ab') as output:
            return subprocess.Popen(['/usr/bin/python3', str(Path(__file__).with_name('guardian.py')),
                                     str(os.getpid()), *argv],
                                    stdin=subprocess.DEVNULL,
                                    stdout=kwargs.pop('stdout', output), stderr=output,
                                    start_new_session=True, **kwargs)

    def acquire(self, app='Wolf UI', width=1280, height=720, fps=30, ttl_seconds=300):
        if type(width) is not int or type(height) is not int or not (640 <= width <= 3840 and 360 <= height <= 2160):
            raise ValueError('Resolution must be within 640x360..3840x2160')
        if fps not in (30, 60):
            raise ValueError('fps must be 30 or 60')
        with self.lock:
            if self.lease:
                raise ValueError('Release the existing lease before acquiring another')
            self.lease = self.remote('acquire', ttl_seconds=ttl_seconds)
            self.directory = self.state / self.lease['id']
            self.directory.mkdir()
            try:
                self.journal({'event': 'acquire', 'lease': self.lease,
                              'requested': dict(app=app, width=width, height=height, fps=fps)})
                self.xvfb = self.spawn(['Xvfb', '-displayfd', '1', '-screen', '0',
                                       f'{width}x{height}x24', '-nolisten', 'tcp'],
                                      'xvfb.log', stdout=subprocess.PIPE)
                with selectors.DefaultSelector() as selector:
                    selector.register(self.xvfb.stdout, selectors.EVENT_READ)
                    if not selector.select(10):
                        raise RuntimeError('Xvfb did not allocate a private display')
                    number = self.xvfb.stdout.readline().decode().strip()
                if not number.isdigit():
                    raise RuntimeError('Xvfb failed to start; inspect xvfb.log')
                self.env = {**os.environ, 'DISPLAY': ':' + number,
                            'SDL_AUDIODRIVER': 'dummy',
                            'XDG_CONFIG_HOME': self.config['moonlight_config']}
                self.moonlight = self.spawn([
                    self.config['moonlight'], 'stream', '--resolution', f'{width}x{height}',
                    '--fps', str(fps), '--bitrate', str(self.config.get('bitrate', 6000)),
                    '--video-codec', 'H.264', '--video-decoder', 'software',
                    '--display-mode', 'windowed', '--no-vsync', '--no-frame-pacing',
                    '--no-quit-after', self.config['stream_host'], app],
                    'moonlight.log', env=self.env)
                deadline = time.monotonic() + 45
                while time.monotonic() < deadline:
                    if self.moonlight.poll() is not None:
                        raise RuntimeError('Moonlight exited; inspect private moonlight.log')
                    status = self.remote('status', lease_id=self.lease['id'])
                    session = next((s for s in status['sessions']
                                    if s['client_id'] == self.lease['client_id']), None)
                    tree = run(['xwininfo', '-root', '-tree'], env=self.env)
                    found = re.search(r'^\s*(0x[0-9a-f]+) ".* - Moonlight":', tree, re.M)
                    if session and found and 'IsViewable' in run(
                            ['xwininfo', '-id', found[1]], env=self.env):
                        self.window = found[1]
                        run(['xdotool', 'windowsize', self.window, str(width), str(height),
                             'windowmove', self.window, '0', '0'], env=self.env)
                        # This establishes stream/window availability, not game readiness.
                        time.sleep(1)
                        result = dict(lease_id=self.lease['id'], session=session,
                                      capture='moonlight-x11', stream_window_available=True,
                                      game_readiness='unknown', artifact_directory=str(self.directory),
                                      expires_at=status['lease']['expires_at'])
                        self.journal({'event': 'stream_connected', **result})
                        return result
                    time.sleep(.3)
                raise RuntimeError('No stream window/session within 45 seconds')
            except BaseException:
                self.release(self.lease['id'])
                raise

    def require(self, lease_id):
        if not self.lease or self.lease['id'] != lease_id:
            raise ValueError('This MCP process does not own that lease')

    def observe(self, lease_id):
        with self.lock:
            self.require(lease_id)
            before = self.remote('status', lease_id=lease_id)
            if self.moonlight.poll() is not None:
                raise RuntimeError('Moonlight has exited; release the lease')
            if not any(s['client_id'] == self.lease['client_id'] for s in before['sessions']):
                raise RuntimeError('Target stream no longer exists')
            # Moonlight can replace its SDL window after decoder initialization.
            # Resolve the current stream window instead of retaining a stale XID.
            tree = run(['xwininfo', '-root', '-tree'], env=self.env)
            found = re.search(r'^\s*(0x[0-9a-f]+) ".* - Moonlight":', tree, re.M)
            if not found or 'IsViewable' not in run(
                    ['xwininfo', '-id', found[1]], env=self.env):
                raise RuntimeError('Moonlight stream window is not viewable')
            if found[1] != self.window:
                self.window = found[1]
                geometry = run(['xdotool', 'getdisplaygeometry'], env=self.env).split()
                run(['xdotool', 'windowsize', self.window, *geometry,
                     'windowmove', self.window, '0', '0'], env=self.env)
            artifact_id = str(uuid.uuid4())
            path = self.directory / (artifact_id + '.png')
            temp = self.directory / (artifact_id + '.tmp.png')
            started = time.time_ns()
            run(['import', '-window', self.window, str(temp)], env=self.env)
            ended = time.time_ns()
            with temp.open('rb') as source:
                os.fsync(source.fileno())
            temp.replace(path)
            dimensions = run(['identify', '-format', '%w %h', str(path)]).split()
            metadata = dict(event='observation', lease_id=lease_id, artifact_id=artifact_id,
                            path=str(path), capture_started_at_ns=started, capture_ended_at_ns=ended,
                            width=int(dimensions[0]), height=int(dimensions[1]),
                            source='remote Wolf stream decoded by Moonlight into private X11 window',
                            game_frame_id=None, game_readiness='unknown', frame_freshness='not measured',
                            target=before)
            self.journal(metadata)
            return metadata, path

    def input(self, lease_id, steps):
        with self.lock:
            self.require(lease_id)
            if self.active_action:
                raise ValueError('Input batch already running')
            action_id = self.active_action = str(uuid.uuid4())
            directory = self.directory
        try:
            result = self.remote('input', lease_id=lease_id, action_id=action_id, steps=steps)
            self.journal(result, directory)
            return result
        finally:
            with self.lock:
                self.active_action = None

    def cancel(self, lease_id):
        with self.lock:
            self.require(lease_id)
            return self.remote('cancel', lease_id=lease_id, action_id=self.active_action)

    def status(self, lease_id=None):
        if lease_id:
            self.require(lease_id)
        return self.remote('status', **({'lease_id': lease_id} if lease_id else {}))

    def release(self, lease_id):
        with self.lock:
            if not self.lease:
                return {'released': True, 'already_released': True}
            self.require(lease_id)
            result = {'released': False, 'errors': []}
            try:
                result = self.remote('release', lease_id=lease_id)
            except Exception as error:
                result['errors'].append(str(error))
                result['target_cleanup'] = 'pending target lease expiry'
            finally:
                for process in (self.moonlight, self.xvfb):
                    if process is not None:
                        if process.poll() is None:
                            try:
                                os.killpg(process.pid, signal.SIGTERM)
                                process.wait(timeout=5)
                            except subprocess.TimeoutExpired:
                                os.killpg(process.pid, signal.SIGKILL)
                                process.wait(timeout=5)
                            except ProcessLookupError:
                                process.wait(timeout=5)
                        if process.stdout:
                            process.stdout.close()
                self.moonlight = self.xvfb = None
            result['local_capture_stopped'] = True
            result['artifact_directory'] = str(self.directory)
            try:
                self.journal({'event': 'release', **result})
            except OSError as error:
                result['evidence_error'] = str(error)
            if result['released']:
                self.lease = None
            return result

    def close(self):
        self.stopped.set()
        if self.lease:
            self.release(self.lease['id'])
        self.watcher.join(timeout=30)
        self.guard.close()
