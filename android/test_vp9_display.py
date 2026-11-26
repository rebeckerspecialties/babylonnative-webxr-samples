import unittest
import numpy as np
from vp9_display import check_display


class StereoFilm(unittest.TestCase):
    def test_requires_both_eye_identifiers_in_order(self):
        frame = np.zeros((80, 160, 3), dtype=np.uint8)
        frame[30:50, :80, 2] = frame[30:50, 80:, 0] = 200
        check_display(frame)
        for broken in (frame[:, ::-1], np.tile(frame[:, :80], (1, 2, 1)), frame * 0):
            with self.assertRaises(ValueError):
                check_display(broken)
