const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const patch = require("./noMirrorScene.cjs");
require("./third_party/BabylonNative/Apps/scripts/questMenuLadder/parentClear.test.cjs");
test("patch the pinned ESM parent clear only, and reject an already adapted module", () => {
    const source = fs.readFileSync(require.resolve("@babylonjs/core/scene.pure.js"), "utf8");
    const result = patch(source);
    assert.ok(result.includes("if (!this._canSkipParentClear(this.activeCamera)) this._clearFrameBuffer(this.activeCamera);"));
    assert.ok(result.includes("this._clearFrameBuffer(camera);"));
    assert.throws(() => patch(result), /Review parent-clear/);
    assert.throws(() => patch(source.replace("this._clearFrameBuffer(this.activeCamera);", "")), /exactly one/);
});
