import test from "node:test";
import assert from "node:assert/strict";
import {XRFrameRate} from "./frameRate.mjs";
import {insertBackgrounds} from "./composition.mjs";

test("rates count intervals, include missed frames and ignore a second eye/callback at the same timestamp", () => {
    const r = new XRFrameRate();
    assert.equal(r.average, undefined);
    assert.equal(r.sample(0), undefined);
    for (let i=1;i<=71;i++) { r.sample(i*1000/72); r.sample(i*1000/72); }
    assert.equal(r.sample(1000),72);
    assert.equal(r.sample(2000),1);
    assert.equal(r.average,36.5);
    r.sample(NaN);
    r.sample(0);
    assert.equal(r.average,undefined);
    r.sample(50);
    assert.equal(r.average,20);
});
test("sample backgrounds precede the projection without changing application layer order", () => {
    const original = Object.freeze(["underlay","controller","overlay"]);
    assert.deepEqual(insertBackgrounds(original,"controller",["movie","quad"]),["underlay","movie","quad","controller","overlay"]);
    assert.deepEqual(insertBackgrounds(original,"controller",["selected"]),["underlay","selected","controller","overlay"]);
    assert.deepEqual(insertBackgrounds(original,"controller",[]),original);
    assert.throws(()=>insertBackgrounds(original,"missing",[]));
});
