"""Fail on the first exception, absent result, dead app, or missed deadline."""
import argparse
from contextlib import ExitStack
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import time


def release_test_process(adb, package, launched_pid, pidof, run=subprocess.run):
    if launched_pid and pidof() == launched_pid:
        run(adb + ["shell", "am", "force-stop", package], check=True, timeout=10)


def pacing_target(case):
    if 111 <= case <= 118:
        return 60 if case in (113, 114) else 72
    if 3 <= case <= 54:
        index = (case - 3) % 26
        if index < 22:
            return 60 if index % 11 >= 7 else 72
    raise ValueError(f"Case {case} is not a timed still or movie")


def verify(lines, pid, expected, pacing=False):
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
            if pacing:
                target = pacing_target(active)
                duration = data.get("steadyMs", 0)
                if (data.get("displayHz") != target or duration < 15000 or
                        data.get("missedRefreshes") != 0 or
                        data.get("steadyIntervals", 0) * 1000 < (target - 0.5) * duration):
                    raise RuntimeError("Pacing gate failed: " + line)
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
    p.add_argument("--pacing", action="store_true", help="Require at least 15 steady seconds at 60/72 Hz with zero missed predicted refreshes")
    p.add_argument("--capture", type=Path, help="Save a display capture during each case, after the sky-only video intro")
    p.add_argument("--log", type=Path, help="Retain this run's ordinary application log, including all timing receipts")
    p.add_argument("checks", nargs="*", type=int, default=[3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 25, 26, 27, 28])
    args = p.parse_args()
    if args.pacing:
        for case in args.checks:
            try:
                pacing_target(case)
            except ValueError as error:
                p.error(str(error))
    if not args.capture and any(case in (107, 108) for case in args.checks):
        p.error("Foreground tests require --capture and a Python interpreter with OpenCV")
    adb = ["adb", "-s", args.serial]
    package = "com.rebeckerspecialties.xrsamples"
    def pidof():
        return subprocess.run(adb + ["shell", "pidof", package], capture_output=True, text=True, timeout=10).stdout.strip()
    pid = None
    seen = 0
    capture_at = None
    verified_foregrounds = []
    if args.capture:
        args.capture.mkdir(exist_ok=True, parents=True)
        if args.pacing:
            p.error("measure pacing without display capture; run the pixel controls separately")
    with ExitStack() as stack:
        out = stack.enter_context(args.log.open("xb") if args.log else tempfile.NamedTemporaryFile())
        reader = subprocess.Popen(adb + ["logcat", "-T", "1", "-v", "threadtime", "-s", "BabylonNative", "AndroidRuntime", "libc"], stdout=out)
        try:
            subprocess.run(adb + ["shell", "am", "start", "-S", "-W", "-n", package + "/.SampleActivity", "--eia", "layerChecks", ",".join(map(str,args.checks))], check=True, timeout=30)
            pid = pidof()
            if not pid:
                raise RuntimeError("Samples did not start")
            deadline = time.monotonic() + 100
            started = 0
            while time.monotonic() < deadline:
                with open(out.name, encoding="utf-8", errors="replace") as log:
                    lines = log.read()
                    starts = [line for line in lines.splitlines() if line.split()[2:3] == [pid] and "XR check begin " in line]
                    if len(starts) > started:
                        started = len(starts)
                        deadline = time.monotonic() + 85
                    if verify(lines, pid, args.checks,args.pacing):
                        if verified_foregrounds != [n for n in args.checks if n in (107, 108)]:
                            raise RuntimeError("Missing composited foreground capture")
                        print("PASS", args.checks)
                        break
                    if args.capture:
                        if len(starts) > seen:
                            seen = len(starts)
                            capture_at = time.monotonic() + (13 if args.checks[seen-1] in (10, 36, 105, 106) else 4)
                        if capture_at and time.monotonic() >= capture_at:
                            path = args.capture / f"{seen:02d}-case-{args.checks[seen-1]}.png"
                            with path.open("wb") as image:
                                subprocess.run(adb + ["exec-out", "screencap", "-p"], stdout=image, check=True, timeout=10)
                            case = args.checks[seen-1]
                            if case in (107, 108):
                                subprocess.run([sys.executable, str(Path(__file__).with_name("check-foreground-display.py")),
                                                "transparent" if case == 107 else "opaque", str(path)], check=True)
                                verified_foregrounds.append(case)
                            capture_at = None
                # Only poll the host copy of the log. A periodic adb shell/pidof
                # competes with the app on Quest and contaminates timing.
                time.sleep(.5)
            else:
                if pidof() != pid:
                    raise RuntimeError("Sample exited without all requested results")
                raise TimeoutError("Timed out waiting for layer results")
        finally:
            reader.terminate()
            reader.wait(timeout=10)
            # This automated entry point deliberately ends its last XR session.
            # Do not leave its empty immersive activity covering the user's Home.
            release_test_process(adb, package, pid, pidof)
