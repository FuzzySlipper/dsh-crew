"""Stop a private process group when its MCP owner exits, including SIGKILL."""
import os
import select
import signal
import subprocess
import sys


def main():
    # A pidfd follows the process, not the short-lived pool thread that spawned us.
    parent = os.pidfd_open(int(sys.argv[1]))
    stopped = False

    def stop(*_):
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    child = subprocess.Popen(sys.argv[2:], start_new_session=True)
    try:
        while not stopped and child.poll() is None:
            ready, _, _ = select.select([parent], [], [], .2)
            if ready:
                break
    finally:
        if child.poll() is None:
            try:
                os.killpg(child.pid, signal.SIGTERM)
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
            except ProcessLookupError:
                child.wait()
        os.close(parent)
    return child.returncode


if __name__ == '__main__':
    sys.exit(main())
