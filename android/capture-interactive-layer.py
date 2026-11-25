"""Capture the real Babylon controller/HUD over an active layer, before returning to the menu."""
import argparse
import json
from pathlib import Path
import subprocess
import time
from layer_pacing import require_compositor_pacing, require_pacing


def capture(serial, page, output, reference_grip, disable_recorder, pacing, film_fps, diagnose, vp9_profile, quest_pacing=False, log_path=None):
    adb = ["adb", "-s", serial]
    package = "com.rebeckerspecialties.xrsamples"
    subprocess.run(adb + ["shell", "am", "start", "-S", "-W", "-n", package + "/.SampleActivity",
                          "--ei", "inspectImage", str(page), "--ez", "inspectGrip", str(output is not None).lower(),
                          "--ei", "inspectFilmFPS", str(film_fps),
                          "--ez", "diagnosePacing", str(diagnose).lower(),
                          "--ez", "inspectVp9Surface", str(vp9_profile is not None).lower(),
                          "--ei", "vp9Profile", str(vp9_profile or 0),
                          "--ez", "referenceGrip", str(reference_grip).lower(),
                          "--ez", "disableRecorder", str(disable_recorder).lower()], check=True, timeout=30)
    pid = subprocess.check_output(adb + ["shell", "pidof", package], text=True).strip()
    assert pid
    timing_log = None
    if output is None:
        # One passive reader instead of starting a logcat process every 250 ms
        # on the measured headset. Fetch the receipt once the case has returned.
        timing_log = subprocess.check_output(adb + ["logcat", "-v", "threadtime", "--pid=" + pid, "--print", "-m", "1", "-e",
                              "XR (image inspection returned|launcher FAIL|layer FAIL)", "-s", "BabylonNative", *(["VrApi"] if quest_pacing else [])],
                              timeout=85, text=True)
        if log_path is not None:
            with log_path.open("x", encoding="utf-8") as receipt:
                receipt.write(timing_log)
    start = None
    captured = False
    deadline = time.monotonic() + 85
    while time.monotonic() < deadline:
        log = timing_log or subprocess.check_output(adb + ["logcat", "-d", "--pid=" + pid, "-s", "BabylonNative"], text=True)
        if "XR launcher FAIL" in log or "XR layer FAIL" in log:
            raise RuntimeError(log.splitlines()[-8:])
        if start is None and "XR displaying layer" in log:
            start = time.monotonic()
        if output is not None and start and not captured and time.monotonic() - start > (12 if page >= 10 else 2):
            if "XR layer submitted" in log:
                raise RuntimeError("Missed the active layer")
            with output.open("wb") as dest:
                subprocess.run(adb + ["exec-out", "screencap", "-p"], stdout=dest, check=True, timeout=12)
            if vp9_profile is not None:
                import cv2
                from vp9_display import check_display
                check_display(cv2.imread(str(output)))
            poses = [line for line in log.splitlines() if "XR inspection grip in viewer space" in line]
            print(poses[-1] if poses else "No grip pose sample")
            captured = True
        if (captured or output is None) and "XR image inspection returned" in log:
            print(next(line for line in log.splitlines() if "XR inspection command recorder" in line))
            line=next(line for line in log.splitlines() if "XR layer submitted " in line)
            print(line)
            if pacing:
                record = json.loads(line.split("XR layer submitted ",1)[1])
                target = 72 if page < 10 or film_fps == 24 else 60
                if quest_pacing:
                    print("Clean VrApi windows:", require_compositor_pacing(log, pid, record, target))
                require_pacing(record, target)
            return
        time.sleep(.25)
    raise TimeoutError("No captured interactive run with a clean return to the menu")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("serial")
    p.add_argument("page", type=int, choices=[3,4,5,6,10,11,12,13])
    p.add_argument("output", nargs="?", type=Path)
    p.add_argument("--timing-only", action="store_true", help="Keep the real foreground but do not take a display capture")
    p.add_argument("--pacing", action="store_true", help="Fail on short runs, wrong display rate or any steady missed refresh")
    p.add_argument("--quest-pacing", action="store_true", help="Also require at least 20 s of complete Quest compositor reports with zero stale frames")
    p.add_argument("--log", type=Path, help="Keep the unmodified timing log, including failing compositor bins")
    p.add_argument("--disable-recorder", action="store_true", help="Matched control for the engine command recorder")
    p.add_argument("--reference-grip", action="store_true", help="Also draw the actual grip asset at a fixed test pose")
    p.add_argument("--film-fps", type=int, choices=(24, 30), default=30)
    p.add_argument("--vp9-profile", type=int, choices=(0, 2), help="Use the specified VP9 profile on the direct media layer (PQ profile 2 fixture is 24 fps)")
    p.add_argument("--diagnose", action="store_true", help="Record upload CPU time and sampled missed-frame intervals; not for qualification")
    args = p.parse_args()
    args.pacing |= args.quest_pacing
    if args.log and not args.timing_only:
        p.error("--log requires --timing-only")
    if args.log and args.log.exists():
        p.error("Refusing to replace an existing timing log")
    if (args.output is None) != args.timing_only:
        p.error("provide either a screenshot path or --timing-only")
    if args.pacing and not args.timing_only:
        p.error("--pacing requires --timing-only")
    if args.pacing and args.diagnose:
        p.error("diagnostic runs cannot qualify pacing")
    if args.vp9_profile is not None and (args.page != 11 or (args.vp9_profile == 2 and args.film_fps != 24)):
        p.error("--vp9-profile requires page 11, and profile 2 requires the 24 fps fixture")
    capture(args.serial, args.page, args.output, args.reference_grip, args.disable_recorder, args.pacing, args.film_fps, args.diagnose, args.vp9_profile, args.quest_pacing, args.log)
