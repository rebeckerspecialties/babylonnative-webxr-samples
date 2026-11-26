"""Cold-start the public APK and check same-process launcher -> fixture -> launcher.

The headset must be awake and tracking. This uses normal logcat only.
"""
import argparse
import subprocess
import tempfile
import time
from device_isolation import require_no_gpu_cts


def verify(log):
    stage = 0
    hands = set()
    for line in log.splitlines():
        if any(s in line for s in ("XR sample FAIL", "XR launcher FAIL", "Uncaptured GPU", "Fatal signal", "FATAL EXCEPTION")):
            raise RuntimeError(line)
        if "XR grip asset PASS " in line:
            hands.add(line.rsplit(" ", 1)[-1])
        if stage == 0 and "XR launcher ready" in line:
            stage = 1
        elif stage == 1 and "XR sample PASS: 32 stereo projection frames" in line:
            stage = 2
        elif stage == 2 and "XR launcher ready" in line:
            stage = 3
    return stage == 3 and hands == {"left", "right"}


def run(serial, count):
    prefix = ["adb", "-s", serial]
    package = "com.rebeckerspecialties.xrsamples"

    def adb(*args, check=True):
        return subprocess.run([*prefix, *args], text=True, capture_output=True, check=check, timeout=25).stdout.strip()

    def cold_start(attempt, capture):
        require_no_gpu_cts(prefix)
        start = adb("shell", "am", "start", "-S", "-W", "-a", "android.intent.action.MAIN",
                    "-c", "android.intent.category.LAUNCHER", "-n", package + "/.SampleActivity",
                    "--ez", "checkHandoff", "true")
        if "Status: ok" not in start:
            raise RuntimeError(start)
        pid = adb("shell", "pidof", package)
        if not pid.isdigit():
            raise RuntimeError("No sample process after launch")
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if adb("shell", "pidof", package, check=False) != pid:
                raise RuntimeError("Sample process exited: " + pid)
            with open(capture, encoding="utf-8", errors="replace") as file:
                log = "\n".join(line for line in file if line.split()[2:3] == [pid])
            if verify(log):
                require_no_gpu_cts(prefix)
                print(f"PASS {attempt + 1}/{count}: PID {pid}, selector, 32 stereo frames, selector", flush=True)
                break
            time.sleep(0.5)
        else:
            raise RuntimeError("No complete round trip for PID " + pid + "\n" + log[-1800:])

    for attempt in range(count):
        with tempfile.NamedTemporaryFile() as capture:
            reader = subprocess.Popen([*prefix, "logcat", "-T", "1", "-v", "threadtime", "-s",
                                       "BabylonNative", "libc", "AndroidRuntime"], stdout=capture)
            try:
                cold_start(attempt, capture.name)
            finally:
                reader.terminate()
                reader.wait(timeout=8)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("serial")
    parser.add_argument("--count", type=int, default=3)
    args = parser.parse_args()
    if args.count < 1:
        parser.error("count must be positive")
    run(args.serial, args.count)
