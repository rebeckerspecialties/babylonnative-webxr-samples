import {test} from "node:test";
import assert from "node:assert/strict";
import {trackHeadSweep} from "./headMotion.mjs";

test("head movement uses tracked view direction, not translation, roll, or frame count", () => {
    const sweep = trackHeadSweep();
    const m = new Float32Array(16);
    m[10] = 1;
    const pose = {transform:{matrix:m}};
    sweep.observe(null);
    sweep.observe({...pose, emulatedPosition:true});
    assert.equal(sweep.result().samples,0);
    sweep.observe(pose);
    m[12] = 1;
    sweep.observe(pose);
    assert.equal(sweep.result().degrees,0);
    m[8] = 0.5; m[10] = Math.sqrt(0.75);
    sweep.observe(pose);
    m[8] = 0; m[10] = 1;
    sweep.observe(pose);
    assert.ok(Math.abs(sweep.result().degrees - 30) < 0.001);
    assert.equal(sweep.result().samples,4);
});
