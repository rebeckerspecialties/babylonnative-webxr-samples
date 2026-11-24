// Count XR frame intervals, not callbacks, video frames or compositor refreshes.
export class XRFrameRate {
    reset() {
        this.first = this.last = this.windowStart = undefined;
        this.intervals = this.windowIntervals = 0;
    }
    constructor() { this.reset(); }
    sample(time) {
        if (!Number.isFinite(time)) return;
        if (time < this.last) this.reset();
        if (this.first === undefined) {
            this.first = this.last = this.windowStart = time;
            return;
        }
        if (this.last === time) return;
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
