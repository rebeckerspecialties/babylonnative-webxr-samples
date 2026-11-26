import { test } from "node:test";
import assert from "node:assert/strict";
import { checkRectPixels, exerciseLayer, filmFrames, inspectionSpace, layerCases, requestFilmRate, requireFactories, uploadPackedVideo } from "./composition.mjs";

test("a resolved rate request is not evidence the display switched",async()=>{
    let frames=0;
    const session={frameRate:72,async updateTargetFrameRate(){},requestAnimationFrame(f){
        if(++frames===3)this.frameRate=60;queueMicrotask(f);
    }};
    await requestFilmRate(session,60);assert.equal(frames,3);
    await assert.rejects(requestFilmRate(session,72),/did not switch/);
});

test("duplicate displays do not acquire a new film image; seeking, looping and later frames do",()=>{
    const film=filmFrames({});
    assert.deepEqual([0,.070,.080,.104,.13,.137,3,.07].map(t=>film.changed(t)),[true,false,false,true,false,true,true,true]);
    film.close();
});
test("decoder frame identity wins over a running clock; cancel the outstanding notification",()=>{
    let queued, canceled, id=0;
    const film=filmFrames({requestVideoFrameCallback(fn){queued=fn;return ++id;},cancelVideoFrameCallback(i){canceled=i;}});
    assert.equal(film.changed(1),true);assert.equal(film.changed(2),false);
    queued(0,{presentedFrames:1});assert.equal(film.changed(2),true);assert.equal(film.changed(2),false);
    film.close();assert.equal(canceled,2);
});

const pixels=[5,12,8,255,125,58,26,255,42,50,44,255,80,82,59,255];
test("image inspection rejects transparent, blank and channel-swapped uploads",()=>{
    checkRectPixels(pixels,"rgba8unorm");
    const bgra=pixels.map((n,i)=>i%4===0?pixels[i+2]:i%4===2?pixels[i-2]:n);
    checkRectPixels(bgra,"bgra8unorm");
    for (const wrong of [bgra,pixels.map(()=>255),pixels.map(()=>0),pixels.map((n,i)=>i===3?0:n)])
        assert.throws(()=>checkRectPixels(wrong,"rgba8unorm"),/rect-mono/);
});
test("inspection anchors once to the first tracked pose after pressing Run",async()=>{
    const transform={position:{x:2,y:1,z:3},orientation:{x:0,y:1,z:0,w:0}};
    let frame=0, child={};
    const base={getOffsetReferenceSpace(t){assert.equal(t,transform);return child;}};
    const session={requestAnimationFrame(callback){queueMicrotask(()=>callback(0,{getViewerPose(space){
        assert.equal(space,base); return ++frame===1 ? null : {transform};
    }}));}};
    assert.equal(await inspectionSpace(session,base),child);
    assert.equal(frame,2);
});

test("top/bottom stereo takes one video snapshot for both eyes", () => {
    const texture={},video={videoWidth:960,videoHeight:1080},calls=[];
    const eye=y=>({colorTexture:texture,viewport:{x:0,y,width:960,height:540},getViewDescriptor:()=>({baseArrayLayer:0})});
    const queue={copyExternalImageToTexture:(...args)=>calls.push(args)};
    uploadPackedVideo(queue,video,eye(0),eye(540));
    assert.deepEqual(calls,[[{source:video},{texture,origin:[0,0,0]},[960,1080]]]);
    assert.throws(()=>uploadPackedVideo(queue,video,eye(0),eye(0)),/viewports/);
    assert.throws(()=>uploadPackedVideo(queue,video,eye(0),{...eye(540),colorTexture:{}}),/viewports/);
    assert.equal(calls.length,1);
});

test("no projection fallback for missing media or GPU factories", () => {
    assert.throws(()=>requireFactories({createProjectionLayer(){}},["Cube"]),/createCubeLayer/);
    assert.throws(()=>requireFactories({createQuadLayer(){}},["Quad","Cylinder"]),/createCylinderLayer/);
});

function harness(t, {badOrder=false, badUpload=false}={}) {
    const previous=[];
    const replace = (k,v) => {
        previous.push([k,Object.getOwnPropertyDescriptor(globalThis,k)]);
        Object.defineProperty(globalThis,k,{value:v,configurable:true});
    };
    t.after(()=>{ for (const [k,d] of previous) if (d) Object.defineProperty(globalThis,k,d); else delete globalThis[k]; });
    let clock=0;
    t.mock.method(performance,"now",()=>clock);
    class Projection { fixedFoveation=0; }
    const projection = new Projection(), copies=[], created=[], session = {
        renderState:{layers:[projection]}, updateRenderState({layers}){
            if(layers.some(l=>l.destroyed)) throw new DOMException("destroyed","InvalidStateError");
            this.pending=layers;
        },
        requestAnimationFrame(fn){ queueMicrotask(()=>{
            if(this.pending) { this.renderState={layers:badOrder && this.pending.length>1 ? this.pending.slice().reverse() : this.pending}; this.pending=null; }
            fn(clock+=1000,{session:this});
        }); }
    };
    const make = () => {
        const l={needsRedraw:true,destroy(){this.destroyed=true;}};
        created.push(l); return l;
    };
    replace("XRProjectionLayer",Projection);
    replace("XRGPUBinding",class {
        createQuadLayer=make; createCubeLayer=make; createCylinderLayer=make;
        getPreferredColorFormat(){return "rgba8unorm";}
        getSubImage(layer){ layer.needsRedraw=false;return {viewport:{x:0,y:0},colorTexture:{format:"rgba8unorm"},getViewDescriptor:()=>({})}; }
    });
    replace("XRRigidTransform",class{});
    replace("Image",class{width=60;height=10;set src(v){queueMicrotask(()=>this.onload());}});
    replace("GPUTextureUsage",{RENDER_ATTACHMENT:16,COPY_DST:2,COPY_SRC:1});
    replace("GPUBufferUsage",{COPY_DST:8,MAP_READ:1});
    replace("GPUMapMode",{READ:1});
    const device={pushErrorScope(){},popErrorScope:async()=>badUpload?{message:"upload error"}:null,
        createBuffer(){return {async mapAsync(){},getMappedRange:()=>Uint8Array.from(pixels).buffer,unmap(){},destroy(){}};},
        createCommandEncoder(){return {copyTextureToBuffer(){},finish(){}};},
        queue:{submit(){},copyExternalImageToTexture(...args){copies.push(args);}}};
    return {session,device,created,projection,copies};
}
test("cube uploads each strip face to its own slice and restores projection and foveation",async t=>{
    const h=harness(t);
    const result=await exerciseLayer(layerCases.find(([_,k])=>k[0]==="Cube"),h.session,h.device,{},"/",1);
    assert.ok(result.frames>=2);
    assert.deepEqual(h.copies.map(([src,dst])=>[src.origin[0],dst.origin[2]]),[[0,0],[10,1],[20,2],[30,3],[40,4],[50,5]]);
    assert.deepEqual(h.session.renderState.layers,[h.projection]);assert.equal(h.projection.fixedFoveation,0);
    assert.ok(h.created[0].destroyed);
});
for(const [options,error] of [[{badOrder:true},/ordered layers/],[{badUpload:true},/upload error/]]) {
    test("wrong submission fails and releases layers: "+error, async t=>{
        const h=harness(t,options);
        await assert.rejects(exerciseLayer(layerCases.find(([_,k])=>k.length===2),h.session,h.device,{},"/",1),error);
        assert.deepEqual(h.session.renderState.layers,[h.projection]);assert.equal(h.projection.fixedFoveation,0);
        assert.ok(h.created.every(l=>l.destroyed));
    });
}
test("destroy rejects resubmission without poisoning the original layer list",async t=>{
    const h=harness(t);
    await exerciseLayer(layerCases.find(c=>c[2]==="destroy"),h.session,h.device,{},"/",null);
    assert.deepEqual(h.session.renderState.layers,[h.projection]);
});
