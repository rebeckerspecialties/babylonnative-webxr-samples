import assert from "node:assert/strict";
import test from "node:test";
import { checkFilmClock } from "./composition.mjs";

test("direct video must advance throughout the measurement, not merely past the first frame", () => {
    checkFilmClock(0.1, 25, 25, 32);
    checkFilmClock(12, 5, 25, 32);
    for (const end of [0, 0.027, 8, NaN]) assert.throws(() => checkFilmClock(0, end, 25, 32), /Decoder clock/);
});
