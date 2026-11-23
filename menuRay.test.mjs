import { test } from "node:test";
import assert from "node:assert/strict";
import { bindMenuInput, menuAnchor, menuHit } from "./menuRay.mjs";
function pose(x = 0, y = 1.6, z = 0, bx = 0, by = 0, bz = 1) {
    return [1,0,0,0, 0,1,0,0, bx,by,bz,0, x,y,z,1];
}
test("pitch does not anchor a menu on the floor; vertical gaze waits for a heading", () => {
    assert.deepEqual(menuAnchor(pose(0, 1.6, 0, 0, 0.8, 0.6)), {x:0,y:1.6,z:-1.25,nx:0,nz:1});
    assert.equal(menuAnchor(pose(0,1,0,0,1,0)), null);
});
test("returning from a raw fixture rebinds triggers and discards the previous space's anchor",()=>{
    const observable=()=>{const callbacks=new Set(); return {
        add:f=>(callbacks.add(f),f), remove:f=>callbacks.delete(f), emit:x=>callbacks.forEach(f=>f(x))
    };};
    const first=new EventTarget(), second=new EventTarget();
    const manager={session:first,onXRSessionInit:observable(),onXRSessionEnded:observable()};
    let hits=0, resets=0;
    const dispose=bindMenuInput(manager,()=>hits++,()=>resets++);
    first.dispatchEvent(new Event("select"));
    assert.equal(hits,1);
    manager.onXRSessionEnded.emit(null);
    first.dispatchEvent(new Event("select"));
    first.dispatchEvent(new Event("squeeze"));
    assert.deepEqual([hits,resets],[1,2]);
    manager.onXRSessionInit.emit(second);
    manager.onXRSessionInit.emit(second);
    second.dispatchEvent(new Event("select"));
    second.dispatchEvent(new Event("squeeze"));
    assert.deepEqual([hits,resets],[2,4]);
    dispose();
    manager.onXRSessionInit.emit(first);
    for (const s of [first,second]) s.dispatchEvent(new Event("select"));
    assert.equal(hits,2);
});
test("hit tests use the action's ray in the same space as the panel", () => {
    const a = menuAnchor(pose());
    assert.deepEqual(menuHit(a, pose(), 1, 1), [0.5,0.5]);
    assert.ok(menuHit(a, pose(-0.2,1.4), 1, 1)[1] > 0.5);
    assert.equal(menuHit(a, pose(0,1.6,0,1,0,0),1,1),null);
    assert.equal(menuHit(a, pose(0,1.6,-2),1,1),null);
    assert.equal(menuHit(a, pose(2),1,1),null);
    assert.equal(menuHit(a, null,1,1),null);
    const side = pose(1,1.6,2,1,0,0);
    assert.deepEqual(menuHit(menuAnchor(side),side,1,1),[0.5,0.5]);
});
