// A motion receipt, not proof of compositor reprojection. Compare display output
// and compositor timings separately, particularly when app cadence is lower.
export function trackHeadSweep() {
    let initial, samples = 0, radians = 0;
    return {
        observe(pose) {
            if (!pose || pose.emulatedPosition) return;
            const m = pose.transform.matrix;
            const length = Math.hypot(m[8], m[9], m[10]);
            if (!(length > 0) || !Number.isFinite(length)) return;
            const forward = [m[8]/length, m[9]/length, m[10]/length];
            initial ??= forward;
            const dot = forward.reduce((sum, v, i) => sum + v * initial[i], 0);
            radians = Math.max(radians, Math.acos(Math.max(-1, Math.min(1, dot))));
            ++samples;
        },
        result() { return {samples, degrees:radians * 180 / Math.PI}; }
    };
}
