import assert from "node:assert/strict";
import test from "node:test";
import {edges} from "./densityPixels.mjs";

test("counts horizontal transitions in the requested eye, ignoring alpha and row padding", () => {
    const bytes = new Uint8Array(8192).fill(255);
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            const pixel = 4096 + y * 256 + x * 4;
            bytes[pixel] = (x ^ y) & 1 ? 255 : 0;
            bytes[pixel + 3] = 0;
        }
    }
    assert.equal(edges(bytes, 0), 0);
    assert.equal(edges(bytes, 4096), 240);
});
