import { test } from "node:test";
import assert from "node:assert/strict";
import { menuAnchor, menuHit } from "./menuRay.mjs";
function pose(x = 0, y = 1.6, z = 0, bx = 0, by = 0, bz = 1) {
    return [1,0,0,0, 0,1,0,0, bx,by,bz,0, x,y,z,1];
}
test("pitch does not anchor a menu on the floor; vertical gaze waits for a heading", () => {
    assert.deepEqual(menuAnchor(pose(0, 1.6, 0, 0, 0.8, 0.6)), {x:0,y:1.6,z:-1.25,nx:0,nz:1});
    assert.equal(menuAnchor(pose(0,1,0,0,1,0)), null);
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
