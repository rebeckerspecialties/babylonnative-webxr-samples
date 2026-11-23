import { test } from "node:test";
import assert from "node:assert/strict";
import { exerciseLayer, layerCases, requireFactories, uploadPackedVideo } from "./composition.mjs";

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
        getSubImage(layer){ layer.needsRedraw=false;return {viewport:{x:0,y:0},colorTexture:{},getViewDescriptor:()=>({})}; }
    });
    replace("XRRigidTransform",class{});
    replace("Image",class{width=60;height=10;set src(v){queueMicrotask(()=>this.onload());}});
    replace("GPUTextureUsage",{RENDER_ATTACHMENT:16,COPY_DST:2});
    const device={pushErrorScope(){},popErrorScope:async()=>badUpload?{message:"upload error"}:null,queue:{copyExternalImageToTexture(...args){copies.push(args);}}};
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
