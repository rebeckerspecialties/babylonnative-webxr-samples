from pathlib import Path
import runpy
import unittest
from unittest.mock import Mock


runner = runpy.run_path(str(Path(__file__).with_name("test-layers.py")))
release = runner["release_test_process"]


class Pacing(unittest.TestCase):
    def test_variants_use_the_actual_display_clock(self):
        for case in (3, 5, 14, 29, 111, 112, 115, 118):
            self.assertEqual(runner["pacing_target"](case), 72)
        for case in (10, 13, 21, 36, 47, 113, 114):
            self.assertEqual(runner["pacing_target"](case), 60)
        for case in (25, 28, 101, 105):
            with self.assertRaisesRegex(ValueError, "not a timed"):
                runner["pacing_target"](case)

    def test_rejects_missed_frames_short_intervals_wrong_rate_and_empty_evidence(self):
        import json
        receipt = dict(frames=1200, displayHz=72, steadyMs=16000, steadyIntervals=1152, missedRefreshes=0)
        def check(record):
            lines = ["a b 1 XR check begin 3", "a b 1 XR layer submitted " + json.dumps(record), "a b 1 XR layer sequence finished"]
            return runner["verify"]("\n".join(lines), "1", [3], True)
        self.assertTrue(check(receipt))
        for delta in (dict(missedRefreshes=1), dict(steadyMs=14999), dict(displayHz=60), dict(steadyIntervals=0)):
            with self.assertRaisesRegex(RuntimeError, "Pacing gate failed"):
                check({**receipt, **delta})


class ActivityCleanup(unittest.TestCase):
    def test_only_stops_the_automated_samples_process_on_the_selected_device(self):
        run = Mock()
        release(["adb", "-s", "headset"], "samples", "314", lambda: "314", run)
        run.assert_called_once_with(["adb", "-s", "headset", "shell", "am", "force-stop", "samples"], check=True, timeout=10)

    def test_absent_or_relaunched_process_is_left_alone(self):
        for initial, current in [(None, "314"), ("314", ""), ("314", "532")]:
            with self.subTest(initial=initial, current=current):
                run = Mock()
                release(["adb"], "samples", initial, lambda: current, run)
                run.assert_not_called()
