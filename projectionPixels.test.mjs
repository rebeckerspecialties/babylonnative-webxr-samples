import { test } from "node:test";
import assert from "node:assert/strict";
import { eyeBaseline, projectionPixels, sampleEye, silhouette } from "./projectionPixels.mjs";

test("binocular order is relative to the head, not the world x axis", () => {
    const turned = (x,z)=>new Float32Array([0,0,-1,0,0,1,0,0,1,0,0,0,x,0,z,1]);
    const headInverse = new Float32Array([0,0,1,0,0,1,0,0,-1,0,0,0,0,0,0,1]);
    const views=[{eye:"left",transform:{matrix:turned(2,.032)}},{eye:"right",transform:{matrix:turned(2,-.032)}}];
    const pose={transform:{inverse:{matrix:headInverse}}, views};
    assert.ok(Math.abs(eyeBaseline(pose)-.064)<1e-6);
    views[1].transform.matrix=turned(2,.032);
    assert.throws(()=>eyeBaseline(pose),/Coincident/);
    views[1].transform.matrix=turned(2,.096);
    assert.throws(()=>eyeBaseline(pose),/reversed/);
    views[1].transform.matrix=turned(1,-.032);
    assert.throws(()=>eyeBaseline(pose),/misaligned/);
});

test("silhouette samples follow a displaced triangle, including both exterior pixels",()=>{
    const m=new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
    const {row,xs}=silhouette(m,1000,1000);
    assert.equal(row,600);
    assert.deepEqual(xs,[500,251,748,247,752]);
    m[12]=.25;
    assert.deepEqual(silhouette(m,1000,1000).xs,xs.map(x=>x+125));
    m[12]=2;
    assert.throws(()=>silhouette(m,1000,1000),/outside/);
});

test("world target has binocular disparity, and both images move when the head translates", () => {
    const identity = () => new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
    const model=identity(); model[14]=-2;
    const proj=identity(); proj[11]=-1; proj[15]=0;
    const camera=x=>{const m=identity();m[12]=-x;return {transform:{inverse:{matrix:m}},projectionMatrix:proj};};
    const center=x=>{const m=sampleEye(camera(x),model);return m[12]/m[15];};
    assert.ok(center(-0.032)>0 && center(0.032)<0);
    assert.ok(center(0.1-0.032)<center(-0.032) && center(0.1+0.032)<center(0.032));
});

test("a native-only multiview capability is not inferred from browser GPU features", async () => {
    const device = { features: new Set(["xr-stereo-multiview"]) };
    await assert.rejects(projectionPixels(null, device, null, true, false, null), /Single-pass multiview unavailable/);
});

test("two-pass works without the native extension; single-pass uses the actual native feature set", async t => {
    const marker = new Error("reached binding");
    const previous = Object.getOwnPropertyDescriptor(globalThis, "XRGPUBinding");
    t.after(() => { if (previous) Object.defineProperty(globalThis, "XRGPUBinding", previous); else delete globalThis.XRGPUBinding; });
    Object.defineProperty(globalThis, "XRGPUBinding", { configurable: true, value: class { constructor() { throw marker; } } });
    await assert.rejects(projectionPixels(null, {}, null, false, false, null), e => e === marker);
    await assert.rejects(projectionPixels(null, { _nativeFeatures: new Set(["xr-stereo-multiview"]) }, null, true, false, null), e => e === marker);
});
