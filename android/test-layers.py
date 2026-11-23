"""Fail on the first exception, absent result, dead app, or missed deadline."""
import argparse
import json
import subprocess
import tempfile
import time


def verify(lines, pid, expected):
    complete = []
    active = None
    for line in lines.splitlines():
        if line.split()[2:3] != [pid]:
            continue
        if any(s in line for s in ("XR layer FAIL", "XR launcher FAIL", "FATAL EXCEPTION", "Fatal signal", "[Uncaught Error]")):
            raise RuntimeError(line)
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
            if complete != expected:
                raise RuntimeError(f"Missing results: {complete} vs {expected}")
            return True
    return False


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("serial")
    p.add_argument("checks", nargs="*", type=int, default=[3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 25, 26, 27, 28])
    args = p.parse_args()
    adb = ["adb", "-s", args.serial]
    package = "com.rebeckerspecialties.xrsamples"
    with tempfile.NamedTemporaryFile() as out:
        reader = subprocess.Popen(adb + ["logcat", "-T", "1", "-v", "threadtime", "-s", "BabylonNative", "AndroidRuntime", "libc"], stdout=out)
        try:
            subprocess.run(adb + ["shell", "am", "start", "-S", "-W", "-n", package + "/.SampleActivity", "--eia", "layerChecks", ",".join(map(str,args.checks))], check=True, timeout=30)
            def pidof():
                return subprocess.run(adb + ["shell", "pidof", package], capture_output=True, text=True, timeout=10).stdout.strip()
            pid = pidof()
            deadline = time.monotonic() + 35 + 65 * len(args.checks)
            while time.monotonic() < deadline:
                with open(out.name, encoding="utf-8", errors="replace") as log:
                    if verify(log.read(), pid, args.checks):
                        print("PASS", args.checks)
                        break
                if not pid or pidof() != pid:
                    raise RuntimeError("Sample exited without all requested results")
                time.sleep(.5)
            else:
                raise TimeoutError("Timed out waiting for layer results")
        finally:
            reader.terminate()
            reader.wait(timeout=10)
