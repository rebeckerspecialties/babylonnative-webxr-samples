"""Capture the real Babylon controller/HUD over an active layer, before returning to the menu."""
import argparse
from pathlib import Path
import subprocess
import time


def capture(serial, page, output, reference_grip):
    adb = ["adb", "-s", serial]
    package = "com.rebeckerspecialties.xrsamples"
    subprocess.run(adb + ["shell", "am", "start", "-S", "-W", "-n", package + "/.SampleActivity",
                          "--ei", "inspectImage", str(page), "--ez", "referenceGrip", str(reference_grip).lower()], check=True, timeout=30)
    pid = subprocess.check_output(adb + ["shell", "pidof", package], text=True).strip()
    assert pid
    start = None
    captured = False
    deadline = time.monotonic() + 85
    while time.monotonic() < deadline:
        log = subprocess.check_output(adb + ["logcat", "-d", "--pid=" + pid, "-s", "BabylonNative"], text=True)
        if "XR launcher FAIL" in log or "XR layer FAIL" in log:
            raise RuntimeError(log.splitlines()[-8:])
        if start is None and "XR displaying layer" in log:
            start = time.monotonic()
        if start and not captured and time.monotonic() - start > (12 if page >= 10 else 2):
            if "XR layer submitted" in log:
                raise RuntimeError("Missed the active layer")
            with output.open("wb") as dest:
                subprocess.run(adb + ["exec-out", "screencap", "-p"], stdout=dest, check=True, timeout=12)
            captured = True
        if captured and "XR image inspection returned" in log:
            print(next(line for line in log.splitlines() if "XR layer submitted" in line))
            return
        time.sleep(.25)
    raise TimeoutError("No captured interactive run with a clean return to the menu")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("serial")
    p.add_argument("page", type=int, choices=[3,4,5,6,10,11,12,13])
    p.add_argument("output", type=Path)
    p.add_argument("--reference-grip", action="store_true", help="Also draw the actual grip asset at a fixed test pose")
    args = p.parse_args()
    capture(args.serial, args.page, args.output, args.reference_grip)
