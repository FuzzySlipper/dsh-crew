"""Failure and cancellation cases that are hard to force against a live game."""
import json
from pathlib import Path
import struct
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from target import Controller, gamepad_packet


class FakeWolf:
    def __init__(self):
        self.sessions = []
        self.lobbies = []
        self.packets = []
        self.raw_packets = []
        self.pressed = threading.Event()
        self.lose_down_reply = False

    def call(self, route, data=None, timeout=5):
        if route == 'clients':
            return {'clients': [{'client_id': 'our-client'}]}
        if route == 'sessions':
            return {'sessions': self.sessions.copy()}
        if route == 'lobbies':
            return {'lobbies': self.lobbies.copy()}
        if route == 'sessions/input':
            raw = bytes.fromhex(data['input_packet_hex'])
            self.raw_packets.append(raw)
            kind = struct.unpack_from('<I', raw, 8)[0]
            key = struct.unpack_from('<H', raw, 13)[0] if kind in (3, 4) else None
            self.packets.append((kind, key))
            if kind in (3, 12):
                self.pressed.set()
                if self.lose_down_reply:
                    raise TimeoutError('Acknowledgement lost after delivery')
            return {'success': True}
        if route == 'sessions/stop':
            self.sessions = [s for s in self.sessions if s['client_id'] != data['session_id']]
            return {'success': True}
        if route == 'lobbies/stop':
            self.lobbies = [l for l in self.lobbies if l['id'] != data['lobby_id']]
            return {'success': True}
        raise AssertionError(route)


class TargetTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.wolf = FakeWolf()
        self.controller = Controller(self.wolf, self.temp.name, 'our-client')
        self.lease = self.controller.dispatch({'op': 'acquire'})['id']
        self.wolf.sessions = [{'client_id': 'our-client'}, {'client_id': 'someone-else'}]

    def test_cancel_releases_chord_before_returning(self):
        result = []
        thread = threading.Thread(target=lambda: result.append(self.controller.input(
            self.lease, [{'kind': 'hold', 'keys': [17, 87], 'ms': 8000}])))
        thread.start()
        self.assertTrue(self.wolf.pressed.wait(1))
        self.controller.dispatch({'op': 'cancel', 'lease_id': self.lease})
        thread.join(2)
        self.assertFalse(thread.is_alive())
        self.assertTrue(result[0]['cancelled'])
        self.assertEqual(sorted(self.wolf.packets), [(3, 17), (3, 87), (4, 17), (4, 87)])

    def test_lost_down_reply_still_releases_key(self):
        self.wolf.lose_down_reply = True
        result = self.controller.input(self.lease, [{'kind': 'hold', 'keys': [87], 'ms': 100}])
        self.assertIn('Acknowledgement lost', result['error'])
        self.assertEqual(self.wolf.packets, [(3, 87), (4, 87)])

    def test_invalid_later_step_prevents_all_delivery(self):
        with self.assertRaises(ValueError):
            self.controller.input(self.lease, [{'kind': 'hold', 'keys': [87], 'ms': 100},
                                               {'kind': 'move', 'dx': 999999, 'dy': 0}])
        self.assertEqual(self.wolf.packets, [])

    def test_gamepad_cancel_and_lost_reply_both_neutralize(self):
        for lost_reply in (False, True):
            self.wolf.pressed.clear()
            self.wolf.raw_packets.clear()
            self.wolf.lose_down_reply = lost_reply
            result = []
            thread = threading.Thread(target=lambda: result.append(self.controller.input(
                self.lease, [{'kind': 'gamepad', 'lx': .5, 'rt': 1,
                              'buttons': ['a', 'lb'], 'ms': 8000}])))
            # Lose only the first reply, allowing neutral acknowledgement.
            original = self.wolf.call
            def call(route, data=None, timeout=5):
                try:
                    return original(route, data, timeout)
                finally:
                    if route == 'sessions/input':
                        self.wolf.lose_down_reply = False
            self.wolf.call = call
            thread.start()
            self.assertTrue(self.wolf.pressed.wait(1))
            self.controller.dispatch({'op': 'cancel', 'lease_id': self.lease})
            thread.join(2)
            self.wolf.call = original
            self.assertFalse(thread.is_alive())
            self.assertEqual(self.wolf.raw_packets[-1], bytes.fromhex(gamepad_packet()))
            self.assertEqual(len(self.wolf.raw_packets), 2)
            self.assertFalse(result[0]['release_errors'])

    def test_gamepad_invalid_state_prevents_delivery(self):
        for state in ({'lx': float('nan')}, {'rt': -1}, {'ry': 1.1}, {'buttons': ['invalid']}):
            with self.assertRaises(ValueError):
                self.controller.input(self.lease, [{'kind': 'gamepad', **state}])
        self.assertEqual(self.wolf.packets, [])

    def test_recovery_neutralizes_gamepad_before_destroying_session(self):
        self.controller.lease['gamepad'] = True
        self.controller.save()
        self.controller = Controller(self.wolf, self.temp.name, 'our-client')
        self.controller.sweep()
        self.assertEqual(self.wolf.raw_packets, [bytes.fromhex(gamepad_packet())])
        self.assertIsNone(self.controller.lease)
        self.assertEqual(self.wolf.sessions, [{'client_id': 'someone-else'}])

    def test_expiry_cleans_only_associated_new_resources(self):
        self.wolf.lobbies = [dict(id='ours', name='ours', connected_sessions=['our-client']),
                             dict(id='other', name='other', connected_sessions=['someone-else'])]
        self.controller.lease['expires_at'] = time.time() - 1
        self.controller.sweep()
        self.assertIsNone(self.controller.lease)
        self.assertEqual(self.wolf.sessions, [{'client_id': 'someone-else'}])
        self.assertEqual([l['id'] for l in self.wolf.lobbies], ['other'])

    def test_restart_recovers_and_cleans_persisted_lease(self):
        self.controller = Controller(self.wolf, self.temp.name, 'our-client')
        self.controller.sweep()
        self.assertIsNone(self.controller.lease)
        records = [json.loads(line) for line in (Path(self.temp.name) / 'events.jsonl').read_text().splitlines()]
        self.assertEqual([r['event'] for r in records], ['acquire', 'release'])
        self.assertTrue(records[-1]['released'])

    def test_other_lease_cannot_deliver_or_release(self):
        with self.assertRaisesRegex(ValueError, 'Unknown'):
            self.controller.input('not-ours', [{'kind': 'hold', 'keys': [87], 'ms': 1}])
        self.assertEqual(self.wolf.packets, [])
        with self.assertRaises(ValueError):
            self.controller.release('not-ours', 'test')

    def test_cancel_arriving_before_input_prevents_delivery(self):
        self.controller.dispatch({'op': 'cancel', 'lease_id': self.lease, 'action_id': 'delayed'})
        result = self.controller.input(self.lease, [{'kind': 'hold', 'keys': [87], 'ms': 500}], 'delayed')
        self.assertTrue(result['cancelled'])
        self.assertEqual(self.wolf.packets, [])

    def test_slow_delivery_exhausts_batch_budget_and_stops_unreleased_session(self):
        clock = [0.0]
        original = self.wolf.call

        def slow(route, data=None, timeout=5):
            if route == 'sessions/input':
                clock[0] += min(timeout, .5)
                if timeout < .5:
                    raise TimeoutError('slow delivery')
            return original(route, data, timeout)

        self.wolf.call = slow
        with patch('target.time.monotonic', side_effect=lambda: clock[0]):
            result = self.controller.input(self.lease, [
                {'kind': 'hold', 'keys': list(range(65, 73)), 'ms': 0}] * 100)
        self.assertIn('error', result)
        self.assertLessEqual(result['elapsed_ms'], 12000)
        self.assertTrue(result['release_errors'])
        self.assertIsNone(self.controller.lease)
        self.assertEqual(self.wolf.sessions, [{'client_id': 'someone-else'}])


if __name__ == '__main__':
    unittest.main()
