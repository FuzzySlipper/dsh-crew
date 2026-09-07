"""Read actual Linux Xbox evdev state for pilot evidence; never injects input."""
import fcntl
import json
from pathlib import Path
import struct
import time


def snapshot():
    devices = []
    for entry in sorted(Path('/sys/class/input').glob('event*')):
        if (entry / 'device/name').read_text().strip() != 'Wolf X-Box One (virtual) pad':
            continue
        path = Path('/dev/input') / entry.name
        with path.open('rb', buffering=0) as device:
            axes = {}
            for name, axis in [('lx', 0), ('ly', 1), ('lt', 2), ('rx', 3), ('ry', 4), ('rt', 5)]:
                data = bytearray(24)
                fcntl.ioctl(device, 0x80184540 + axis, data)  # EVIOCGABS(axis)
                value, minimum, maximum, *_ = struct.unpack('6i', data)
                axes[name] = dict(value=value, minimum=minimum, maximum=maximum)
            keys = bytearray(96)
            fcntl.ioctl(device, 0x80604518, keys)  # EVIOCGKEY(96)
            pressed = [i for i in range(768) if keys[i // 8] & (1 << (i % 8))]
            devices.append(dict(path=str(path), axes=axes, pressed_linux_keys=pressed))
    return dict(time_ns=time.time_ns(), source='Linux evdev ioctl', devices=devices)


if __name__ == '__main__':
    print(json.dumps(snapshot()))
