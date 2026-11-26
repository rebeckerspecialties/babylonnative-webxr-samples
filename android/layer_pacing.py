"""Acceptance applies to every interval after warmup, not a chosen clean streak."""
import re


def require_pacing(record, target):
    duration = record.get("steadyMs", 0)
    if (record.get("displayHz") != target or duration < 20000 or
            record.get("missedRefreshes") != 0 or
            record.get("steadyIntervals", 0) * 1000 < (target - 0.5) * duration):
        raise RuntimeError(f"Pacing gate failed: expected {target} Hz, got {record}")


def require_compositor_pacing(log, pid, record, target, *, marker="XR displaying layer ", seconds=20):
    """Check complete one-second VrApi windows strictly inside the steady interval."""
    first = None
    reports = []
    for line in log.splitlines():
        fields = line.split(None, 6)
        if len(fields) != 7 or fields[2] != str(pid):
            continue
        tag, message = fields[5].rstrip(":"), fields[6].lstrip(": ")
        if tag not in ("BabylonNative", "VrApi"):
            continue
        hour, minute, second = fields[1].split(":")
        now = int(hour) * 3600 + int(minute) * 60 + float(second)
        if tag == "BabylonNative" and message.startswith(marker):
            if first is not None:
                raise RuntimeError("Expected one layer exposure per compositor run")
            first = now
        if first is None or tag != "VrApi":
            continue
        # Ignore boundary bins. A late log line must not count startup or teardown.
        elapsed = (now - first) % 86400
        if not 3.1 <= elapsed <= 1.9 + record["steadyMs"] / 1000:
            continue
        match = re.search(r"\bFPS=\d+/(\d+),[^\n]*?\bStale=(\d+),", message)
        if match:
            reports.append((elapsed, int(match[1]), int(match[2])))
    gaps = [b[0] - a[0] for a, b in zip(reports, reports[1:])]
    if (len(reports) < seconds + 1 or reports[-1][0] - reports[0][0] < seconds - 0.1
            or any(not 0.65 <= gap <= 1.35 for gap in gaps)):
        raise RuntimeError(f"Incomplete compositor timing coverage: {len(reports)} middle windows for PID {pid}")
    stale = sum(stale for _, _, stale in reports)
    if stale or any(hz != target for _, hz, _ in reports):
        raise RuntimeError(f"Compositor pacing failed: {stale} stale frames in {len(reports)} windows at requested {target} Hz")
    return len(reports)
