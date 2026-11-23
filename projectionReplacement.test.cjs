const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const {join} = require("node:path");
const test = require("node:test");
const {runInNewContext} = require("node:vm");
const create = runInNewContext(readFileSync(join(__dirname, "projectionReplacement.js"), "utf8") + "\nprojectionReplacement");

test("both views retain the previous projection until the boundary in each direction", () => {
    const a={}, b={};
    let pending;
    const session = {renderState:{layers:[a]}, updateRenderState(s){pending=s;}};
    const control=create({createProjectionLayer(d){assert.equal(d.scaleFactor,0.75); return b;}},a,{},1);
    for (const layer of [a,b,a]) {
        assert.equal(control.begin(session),layer);
        control.end(session);
        assert.equal(session.renderState.layers[0],layer);
        session.renderState=pending;
    }
    assert.equal(control.complete,true);
});

test("rejects an early or missing replacement", () => {
    const a={}, b={};
    const early={renderState:{layers:[a]},updateRenderState(s){this.renderState=s;}};
    const createControl=()=>create({createProjectionLayer(){return b;}},a,{},1);
    const c=createControl();
    c.begin(early);
    assert.throws(()=>c.end(early),/inside the active/);
    const missed={renderState:{layers:[a]},updateRenderState(){}};
    const d=createControl();
    d.begin(missed);d.end(missed);
    assert.throws(()=>d.begin(missed),/missing on next/);
});
