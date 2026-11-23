from pathlib import Path
import runpy
import unittest
from unittest.mock import Mock


release = runpy.run_path(str(Path(__file__).with_name("test-layers.py")))["release_test_process"]


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
