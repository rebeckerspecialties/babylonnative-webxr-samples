import runpy
import unittest
from pathlib import Path

import cv2

root = Path(__file__).resolve().parents[1]
verify = runpy.run_path(str(root / "android/verify-displayed-image.py"))["matches_in_each_eye"]


class DisplayedImages(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.photo = cv2.imread(str(root / "third_party/webxr-samples/media/textures/rect-mono.png"), 0)

    def test_captured_layers_are_visible_in_both_eyes(self):
        for kind in ["quad", "cylinder"]:
            with self.subTest(kind=kind):
                image = cv2.imread(str(root / f"qualification/quest-1/interactive-{kind}.png"), 0)
                self.assertEqual(len(verify(self.photo, image)), 2)

    def test_missing_either_eye_fails(self):
        image = cv2.imread(str(root / "qualification/quest-1/interactive-quad.png"), 0)
        half = image.shape[1] // 2
        for side, start in [("left", 0), ("right", half)]:
            with self.subTest(side=side):
                missing = image.copy()
                missing[:, start:start + half] = 0
                with self.assertRaisesRegex(ValueError, side + " eye"):
                    verify(self.photo, missing)


if __name__ == "__main__":
    unittest.main()
