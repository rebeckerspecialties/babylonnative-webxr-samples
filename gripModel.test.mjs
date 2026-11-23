import { test } from "node:test";
import assert from "node:assert/strict";
import { attachGripModel } from "./gripModel.mjs";

for (const duringLoad of [false, true]) test("disconnect " + (duringLoad ? "during" : "after") + " grip load", async () => {
    let disconnect, draw, released = 0, resolve;
    const frames = {add(fn) { return draw = fn; }, remove(fn) { assert.equal(fn,draw); draw = null; }};
    const root = {dispose() { released++; }, setEnabled(v) { this.visible = v; }};
    const child = {parent:root};
    const controller = {grip:{isDisposed:()=>false},inputSource:{targetRayMode:"tracked-pointer",gripSpace:1},
        onDisposeObservable:{addOnce(fn) { disconnect=fn; }}};
    const ready = attachGripModel(controller, () => new Promise(r => { resolve=r; }),frames,()=>2);
    if (duringLoad) disconnect();
    resolve([root, child]); await ready;
    if (!duringLoad) {
        assert.equal(root.parent,controller.grip); assert.equal(root.visible,false);
        draw({getPose:(grip,base)=>grip===1 && base===2}); assert.equal(root.visible,true);
        draw({getPose:()=>null}); assert.equal(root.visible,false);
        disconnect();
    }
    assert.equal(released,1); assert.ok(!draw);
});
