"""Fail on the first exception, absent result, dead app, or missed deadline."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
import time


def release_test_process(adb, package, launched_pid, pidof, run=subprocess.run):
    if launched_pid and pidof() == launched_pid:
        run(adb + ["shell", "am", "force-stop", package], check=True, timeout=10)


def verify(lines, pid, expected):
    complete = []
    warp_accepted = False
    active = None
    for line in lines.splitlines():
        if line.split()[2:3] != [pid]:
            continue
        if any(s in line for s in ("XR layer FAIL", "XR launcher FAIL", "FATAL EXCEPTION", "Fatal signal", "[Uncaught Error]")):
            raise RuntimeError(line)
        if "Submitted stereo motion and depth to OpenXR compositor" in line:
            warp_accepted = True
        if "XR check begin " in line:
            active = int(line.split("XR check begin ")[1])
            if active != expected[len(complete)]:
                raise RuntimeError(line)
        if "XR layer submitted " in line:
            data = json.loads(line.split("XR layer submitted ")[1])
            if active is None or not data["frames"]:
                raise RuntimeError(line)
            complete.append(active)
            active = None
        if "XR layer sequence finished" in line:
            if any(case in (100, 102, 103, 104) for case in expected) and not warp_accepted:
                raise RuntimeError("OpenXR did not accept the motion/depth projection")
            if complete != expected:
                raise RuntimeError(f"Missing results: {complete} vs {expected}")
            return True
    return False


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("serial")
    p.add_argument("--capture", type=Path, help="Save a display capture during each case, after the sky-only video intro")
    p.add_argument("checks", nargs="*", type=int, default=[3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 25, 26, 27, 28])
    args = p.parse_args()
    adb = ["adb", "-s", args.serial]
    package = "com.rebeckerspecialties.xrsamples"
    def pidof():
        return subprocess.run(adb + ["shell", "pidof", package], capture_output=True, text=True, timeout=10).stdout.strip()
    pid = None
    seen = 0
    capture_at = None
    if args.capture:
        args.capture.mkdir(exist_ok=True, parents=True)
    with tempfile.NamedTemporaryFile() as out:
        reader = subprocess.Popen(adb + ["logcat", "-T", "1", "-v", "threadtime", "-s", "BabylonNative", "AndroidRuntime", "libc"], stdout=out)
        try:
            subprocess.run(adb + ["shell", "am", "start", "-S", "-W", "-n", package + "/.SampleActivity", "--eia", "layerChecks", ",".join(map(str,args.checks))], check=True, timeout=30)
            pid = pidof()
            deadline = time.monotonic() + 35 + 65 * len(args.checks)
            while time.monotonic() < deadline:
                with open(out.name, encoding="utf-8", errors="replace") as log:
                    lines = log.read()
                    if verify(lines, pid, args.checks):
                        print("PASS", args.checks)
                        break
                    if args.capture:
                        starts = [line for line in lines.splitlines() if line.split()[2:3] == [pid] and "XR check begin " in line]
                        if len(starts) > seen:
                            seen = len(starts)
                            capture_at = time.monotonic() + (13 if args.checks[seen-1] in (10, 36, 105, 106) else 4)
                        if capture_at and time.monotonic() >= capture_at:
                            path = args.capture / f"{seen:02d}-case-{args.checks[seen-1]}.png"
                            with path.open("wb") as image:
                                subprocess.run(adb + ["exec-out", "screencap", "-p"], stdout=image, check=True, timeout=10)
                            capture_at = None
                if not pid or pidof() != pid:
                    raise RuntimeError("Sample exited without all requested results")
                time.sleep(.5)
            else:
                raise TimeoutError("Timed out waiting for layer results")
        finally:
            reader.terminate()
            reader.wait(timeout=10)
            # This automated entry point deliberately ends its last XR session.
            # Do not leave its empty immersive activity covering the user's Home.
            release_test_process(adb, package, pid, pidof)
