const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { collectTrackedInput } = vm.runInNewContext(fs.readFileSync(require.resolve("./trackedInput.js"), "utf8") + "\n({ collectTrackedInput })");
const pose = x => {
    const matrix = new Float32Array(16);
    for (const i of [0, 5, 10, 15]) matrix[i] = 1;
    matrix[12] = x;
    return { transform: { matrix } };
};
function input(handedness, x) {
    return { targetRayMode: "tracked-pointer", handedness, gripSpace: pose(x), targetRaySpace: pose(x + 1) };
}
test("grip and aiming poses remain independent for each hand and each frame", () => {
    const left = input("left", -4), right = input("right", 3);
    const reference = {};
    const f = { session: { inputSources: [left, right] }, getPose(space, origin) { assert.equal(origin, reference); return space; } };
    const out = new Float32Array(80);
    assert.equal(collectTrackedInput(f, reference, out), 4);
    assert.deepEqual([12, 32, 52, 72].map(i => out[i]), [-4, -3, 3, 4]);
    assert.deepEqual([16, 36, 56, 76].map(i => [out[i], out[i + 1]]), [[0,1], [1,1], [0,0], [1,0]]);
    f.session.inputSources = [right];
    right.gripSpace = null;
    assert.equal(collectTrackedInput(f, reference, out), 1);
    assert.equal(out[12], 4);
    f.getPose = () => null;
    assert.equal(collectTrackedInput(f, reference, out), 0);
});
test("gaze, hand tracking and untracked poses do not produce phantom controllers", () => {
    const sources = [{...input("right", 1), targetRayMode: "gaze"}, {...input("left", 0), hand: {}}];
    const f = { session: {inputSources: sources}, getPose() { assert.fail(); } };
    assert.equal(collectTrackedInput(f, {}, new Float32Array(80)), 0);
});
