"""Check a threadtime log of a cold launch with --ez firstMenuPacing true."""
import argparse
import json
from pathlib import Path

from layer_pacing import require_compositor_pacing, require_pacing


def check(log, pid):
    prefix = "XR first menu pacing "
    records = []
    for line in log.splitlines():
        fields = line.split(None, 6)
        if len(fields) != 7 or fields[2] != str(pid) or fields[5].rstrip(":") != "BabylonNative":
            continue
        message = fields[6].lstrip(": ")
        if message.startswith(prefix):
            records.append(json.loads(message[len(prefix):]))
    if len(records) != 1 or records[0]["steadyMs"] < 32000:
        raise ValueError(f"Expected a complete first-menu run for PID {pid}: {records}")
    record = records[0]
    errors = []
    for verify in [lambda: require_pacing(record, 72),
                   lambda: require_compositor_pacing(log, pid, record, 72, marker="XR displaying first menu", seconds=30)]:
        try:
            verify()
        except RuntimeError as error:
            errors.append(str(error))
    if errors:
        raise ValueError("; ".join(errors))
    return record


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("log", type=Path)
    parser.add_argument("pid", type=int)
    args = parser.parse_args()
    print(check(args.log.read_text(), args.pid))
