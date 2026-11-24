// Count XR frame intervals, not callbacks, video frames or compositor refreshes.
export class XRFrameRate {
    reset() {
        this.first = this.last = this.windowStart = undefined;
        this.intervals = this.windowIntervals = 0;
        this.steadyIntervals = this.missed = this.maxGapMs = 0;
    }
    constructor(displayHz=0) { this.displayHz=displayHz; this.reset(); }
    sample(time) {
        if (!Number.isFinite(time)) return;
        if (time < this.last) this.reset();
        if (this.first === undefined) {
            this.first = this.last = this.windowStart = time;
            return;
        }
        if (this.last === time) return;
        if (this.displayHz>0 && this.last-this.first>=2000) {
            const gap=time-this.last;
            ++this.steadyIntervals;
            this.maxGapMs=Math.max(this.maxGapMs,gap);
            this.missed+=Math.max(0,Math.round(gap*this.displayHz/1000)-1);
        }
        this.last = time;
        ++this.intervals;
        ++this.windowIntervals;
        const elapsed = time - this.windowStart;
        if (elapsed < 1000) return;
        const fps = 1000 * this.windowIntervals / elapsed;
        this.windowStart = time;
        this.windowIntervals = 0;
        return fps;
    }
    get average() {
        return this.intervals ? 1000 * this.intervals / (this.last - this.first) : undefined;
    }
}
