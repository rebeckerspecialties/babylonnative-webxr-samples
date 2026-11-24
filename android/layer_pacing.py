"""Acceptance applies to every interval after warmup, not a chosen clean streak."""


def require_pacing(record, target):
    duration = record.get("steadyMs", 0)
    if (record.get("displayHz") != target or duration < 15000 or
            record.get("missedRefreshes") != 0 or
            record.get("steadyIntervals", 0) * 1000 < (target - 0.5) * duration):
        raise RuntimeError(f"Pacing gate failed: expected {target} Hz, got {record}")
