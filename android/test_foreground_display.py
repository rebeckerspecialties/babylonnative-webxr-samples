import runpy
from pathlib import Path
import unittest
import numpy as np

inspect = runpy.run_path(str(Path(__file__).with_name("check-foreground-display.py")))["inspect"]


class LayerCapture(unittest.TestCase):
    def test_order_alpha_and_eye_routing_are_independent(self):
        for opaque in (False, True):
            frame = np.full((200, 400, 3), 0 if opaque else 90, dtype=np.uint8)
            frame[90:110,90:110] = (0,0,255)
            frame[90:110,290:310] = (255,0,0)
            self.assertEqual(len(inspect(frame, opaque)), 2)
            with self.assertRaisesRegex(ValueError, "panorama"):
                inspect(frame, not opaque)
            with self.assertRaisesRegex(ValueError, "foreground"):
                inspect(np.roll(frame, 200, axis=1), opaque)
            for start in (0,200):
                blank = frame.copy()
                blank[:,start:start+200] = 0
                with self.assertRaisesRegex(ValueError, "foreground"):
                    inspect(blank, opaque)
