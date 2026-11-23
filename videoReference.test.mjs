import {test} from "node:test";
import assert from "node:assert/strict";
import {referenceRGB} from "./videoReference.mjs";
import {compareStereoRGB,videoAngles} from "./composition.mjs";

test("matches the correct time and eye assignment, not just changing video bytes",()=>{
    const index=8, time=12+index/6;
    const pixels=Buffer.from(referenceRGB[index],"hex"), half=pixels.length/2;
    const left=pixels.subarray(0,half),right=pixels.subarray(half);
    assert.equal(compareStereoRGB(pixels,time).disparity,1);
    for(const bad of [Buffer.concat([left,left]),Buffer.concat([right,right]),Buffer.concat([right,left]),
                      Buffer.alloc(pixels.length,0),Buffer.from(pixels.map((v,i)=>i%3===1?185:0))])
        assert.throws(()=>compareStereoRGB(bad,time),/left\/right VP8/);
    assert.throws(()=>compareStereoRGB(pixels,0),/left\/right VP8/);
});
test("bounds 16:9 film by its per-eye dimensions, centered at the horizon",()=>{
    const opts=videoAngles(960,540);
    assert.equal(opts.centralHorizontalAngle,Math.PI/2);
    assert.equal(opts.upperVerticalAngle,-opts.lowerVerticalAngle);
    assert.equal(opts.centralHorizontalAngle/(2*opts.upperVerticalAngle),16/9);
});
