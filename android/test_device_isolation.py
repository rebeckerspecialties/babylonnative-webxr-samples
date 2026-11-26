import unittest
from unittest.mock import Mock

from device_isolation import require_no_gpu_cts


class DeviceIsolationTests(unittest.TestCase):
    def check(self, rows):
        run = Mock(return_value=rows)
        require_no_gpu_cts(["adb", "-s", "quest"], run)
        run.assert_called_once_with(["adb", "-s", "quest", "shell", "ps", "-A", "-T", "-o", "PID,TID,NAME"],
                                    text=True, timeout=15)

    def test_regular_thread_names_including_spaces_are_allowed(self):
        self.check("  PID  TID NAME\n1 1 init\n7 13 Profile Saver\n18 18 com.example.cts_runner_ui\n")

    def test_driver_client_or_allocator_thread_disqualifies(self):
        for row in ("23 23 /data/local/tmp/NativeWebGPUCts", "61 67 cts_runner"):
            with self.subTest(row=row), self.assertRaisesRegex(RuntimeError, "Concurrent GPU CTS.*PID.*TID"):
                self.check("PID TID NAME\n1 1 init\n" + row)

    def test_unknown_or_empty_inventory_fails_closed(self):
        for table in ("", "PID TID NAME\n", "PID NAME\n1 init", "PID TID NAME\nerror reading proc"):
            with self.subTest(table=table), self.assertRaisesRegex(RuntimeError, "Cannot verify"):
                self.check(table)
