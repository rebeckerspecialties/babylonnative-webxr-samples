"""Check for competing native GPU conformance work outside the measured interval."""
import subprocess


def require_no_gpu_cts(adb, run=subprocess.check_output):
    # The Quest kernel identified cts_runner as a thread, not necessarily argv[0].
    table = run([*adb, "shell", "ps", "-A", "-T", "-o", "PID,TID,NAME"], text=True, timeout=15)
    rows = table.splitlines()
    if not rows or rows[0].split() != ["PID", "TID", "NAME"]:
        raise RuntimeError("Cannot verify device isolation: missing Android process/thread table")
    seen = False
    for row in rows[1:]:
        fields = row.split(None, 2)
        if len(fields) != 3 or not all(field.isdigit() for field in fields[:2]):
            raise RuntimeError("Cannot verify device isolation: invalid Android process/thread row")
        pid, tid, name = fields
        seen = True
        if name.strip().rsplit("/", 1)[-1] in {"cts_runner", "NativeWebGPUCts"}:
            raise RuntimeError(f"Concurrent GPU CTS: {name.strip()} (PID {pid}, TID {tid}); retry on an idle device")
    if not seen:
        raise RuntimeError("Cannot verify device isolation: empty Android process/thread table")
