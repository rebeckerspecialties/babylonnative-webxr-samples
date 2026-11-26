import test from "node:test";
import assert from "node:assert/strict";
import {XRFrameRate} from "./frameRate.mjs";
import {insertBackgrounds,imageSourceOrigin,checkStereoCubeEye} from "./composition.mjs";

test("stereo cube uses one texture with distinct six-face eye ranges", () => {
    const tex = {depthOrArrayLayers:12};
    const left = {dimension:"2d",arrayLayerCount:1,baseArrayLayer:0}, right = {...left,baseArrayLayer:6};
    checkStereoCubeEye(tex,left,"left");
    checkStereoCubeEye(tex,right,"right",tex);
    for (const [t, d, eye] of [[{...tex},right,"right"], [tex,left,"right"], [tex,right,"left"],
        [{depthOrArrayLayers:6},left,"left"], [tex,{...left,dimension:"cube",arrayLayerCount:6},"left"]]) {
        assert.throws(() => checkStereoCubeEye(t,d,eye,tex), /Invalid stereo cube/);
    }
});

test("stereo eye sources follow the flipped cube strip and unflipped top/bottom images",()=>{
    for (let face=0;face<6;face++) {
        assert.deepEqual(imageSourceOrigin(true,true,"left",face,8,8),[(6+face)*8,0]);
        assert.deepEqual(imageSourceOrigin(true,true,"right",face,8,8),[face*8,0]);
        assert.deepEqual(imageSourceOrigin(true,false,"none",face,8,8),[face*8,0]);
    }
    assert.deepEqual(imageSourceOrigin(false,true,"left",0,16,9),[0,0]);
    assert.deepEqual(imageSourceOrigin(false,true,"right",0,16,9),[0,9]);
});

test("steady pacing excludes startup, duplicate timestamps and previous sessions",()=>{
    const rate=new XRFrameRate(60);
    for(const t of [0,2000,2000,2017,2067,2067]) rate.sample(t);
    assert.equal(rate.steadyIntervals,2); assert.equal(rate.missed,2); assert.equal(rate.maxGapMs,50);
    assert.equal(rate.steadyMs,67); assert.equal(rate.longestCleanMs,17); assert.equal(rate.cleanMs,0);
    rate.sample(100); assert.equal(rate.steadyIntervals,0); assert.equal(rate.missed,0);
    assert.equal(rate.longestCleanMs,0); assert.equal(rate.steadyMs,0);
});

test("rates count intervals, include missed frames and ignore a second eye/callback at the same timestamp", () => {
    const r = new XRFrameRate();
    assert.equal(r.average, undefined);
    assert.equal(r.sample(0), undefined);
    for (let i=1;i<=71;i++) { r.sample(i*1000/72); r.sample(i*1000/72); }
    assert.equal(r.sample(1000),72);
    assert.equal(r.sample(2000),1);
    assert.equal(r.average,36.5);
    r.sample(NaN);
    r.sample(0);
    assert.equal(r.average,undefined);
    r.sample(50);
    assert.equal(r.average,20);
});
test("sample backgrounds precede the projection without changing application layer order", () => {
    const original = Object.freeze(["underlay","controller","overlay"]);
    assert.deepEqual(insertBackgrounds(original,"controller",["movie","quad"]),["underlay","movie","quad","controller","overlay"]);
    assert.deepEqual(insertBackgrounds(original,"controller",["selected"]),["underlay","selected","controller","overlay"]);
    assert.deepEqual(insertBackgrounds(original,"controller",[]),original);
    assert.throws(()=>insertBackgrounds(original,"missing",[]));
});
