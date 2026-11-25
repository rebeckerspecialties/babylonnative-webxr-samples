from datetime import datetime, timedelta
import unittest

from layer_pacing import require_compositor_pacing, require_pacing


class CompositorPacing(unittest.TestCase):
    record = dict(steadyMs=23000, displayHz=60, missedRefreshes=0, steadyIntervals=1380)

    def log(self, *, stale=-1, omit=(), wrong_rate=-1, pid=17):
        start = datetime(2026, 11, 24, 23, 59, 50)
        def stamp(delta):
            return (start + timedelta(seconds=delta)).strftime("%m-%d %H:%M:%S.%f")
        return "\n".join([f"{stamp(0)} 17 22 I BabylonNative: XR displaying layer Media equirect"] +
            [f"{stamp(i + 0.4)} {pid} 91 I VrApi   : FPS=60/{72 if i == wrong_rate else 60},Stale={int(i == stale)},TW=5ms"
             for i in range(27) if i not in omit])

    def test_clean_middle_after_midnight(self):
        self.assertEqual(require_compositor_pacing(self.log(stale=1), 17, self.record, 60), 22)
        self.assertEqual(require_compositor_pacing(self.log(stale=25), 17, self.record, 60), 22)

    def test_clean_callbacks_do_not_mask_a_stale_compositor_frame(self):
        require_pacing(self.record, 60)
        with self.assertRaisesRegex(RuntimeError, "1 stale"):
            require_compositor_pacing(self.log(stale=12), 17, self.record, 60)

    def test_incomplete_wrong_pid_wrong_rate_and_missing_marker(self):
        for log in (self.log(omit=(10,)), self.log(omit=range(10, 26)), self.log(pid=19),
                    self.log(wrong_rate=10), self.log().split("\n", 1)[1], ""):
            with self.subTest(log=log[:100]), self.assertRaises(RuntimeError):
                require_compositor_pacing(log, 17, self.record, 60)
