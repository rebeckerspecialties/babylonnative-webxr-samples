import { test } from "node:test";
import assert from "node:assert/strict";
import { projectionPixels } from "./projectionPixels.mjs";

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
