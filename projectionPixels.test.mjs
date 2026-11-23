import { test } from "node:test";
import assert from "node:assert/strict";
import { projectionPixels, sampleEye } from "./projectionPixels.mjs";

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
