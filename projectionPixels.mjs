import { bounded } from "./composition.mjs";
// Compare a single array draw with two eye draws before compositor submission.
export function multiply(a,b) {
    const c = new Float32Array(16);
    for(let j=0;j<4;j++) for(let i=0;i<4;i++)
        for(let k=0;k<4;k++) c[j*4+i]+=a[k*4+i]*b[j*4+k];
    return c;
}
export function sampleEye(view, model) {
    return multiply(view.projectionMatrix, multiply(view.transform.inverse.matrix, model));
}
export async function projectionPixels(session, device, space, singlePass, withDepth, foveation) {
    if (singlePass && !device._nativeFeatures?.has("xr-stereo-multiview")) throw Error("Single-pass multiview unavailable");
    const binding = new XRGPUBinding(session,device), format = binding.getPreferredColorFormat();
    const original = Array.from(session.renderState.layers ?? []);
    const layer = binding.createProjectionLayer({colorFormat:format,
        ...(withDepth ? {depthStencilFormat:"depth24plus"} : {}),
        textureUsage:GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC});
    let readback, uniforms, vertices, model, changed = false, active = true, timer;
    device.pushErrorScope("validation");
    let scope=true;
    try {
        if (foveation !== null) {
            if (layer.fixedFoveation == null) throw Error("Projection fixed foveation unsupported");
            layer.fixedFoveation = foveation;
            if (layer.fixedFoveation !== foveation) throw Error("Foveation not retained");
        }
        const module = device.createShaderModule({ code:`
struct Eyes {left:mat4x4f,right:mat4x4f};
@group(0) @binding(0) var<uniform> clip:Eyes;
struct V { @builtin(position) p:vec4f, @location(0) @interpolate(flat) eye:u32, @location(1) @interpolate(flat) near:u32 };
@vertex fn vs(@location(0) point:vec3f, @builtin(vertex_index) vertex:u32, @builtin(${singlePass ? "view_index" : "instance_index"}) eye:u32)->V {
    let p=vec4f(point,1);
    return V(select(clip.left*p,clip.right*p,eye!=0u),eye,u32(vertex<3u));
}
@fragment fn fs(v:V)->@location(0) vec4f {return select(vec4f(0.1,0.22,0.36,1),vec4f(1,0.6,0.2+f32(v.eye)*0.02,1),v.near!=0u);}
`});
        const multiview = singlePass ? {_xrViewCount:2} : {};
        const pipeline = await bounded(device.createRenderPipelineAsync({layout:"auto",...multiview,
            vertex:{module,entryPoint:"vs",buffers:[{arrayStride:12,attributes:[{shaderLocation:0,offset:0,format:"float32x3"}]}]},fragment:{module,entryPoint:"fs",targets:[{format}]},
            ...(withDepth ? {depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"}} : {})}),15000,"Stereo pipeline creation timed out");
        readback=device.createBuffer({size:8,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
        uniforms = device.createBuffer({size:128,usage:GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
        const packed = new Float32Array(32);
        const points=new Float32Array([-.75,-.7,0,.75,-.7,0,0,.8,0,-1.275,-1.19,-.6,1.275,-1.19,-.6,0,1.36,-.6]);
        vertices=device.createBuffer({size:points.byteLength,usage:GPUBufferUsage.VERTEX|GPUBufferUsage.COPY_DST});
        device.queue.writeBuffer(vertices,0,points);
        const group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:uniforms,offset:0,size:128}}]});
        session.updateRenderState({layers:[layer]}); changed = true;
        let frames = 0, begin, firstTimestamp;
        const stamps=await bounded(Promise.all([0,1].map(()=>new Promise(done=>session.requestAnimationFrame(done)))),5000,"No paired XR callbacks");
        if(!Number.isFinite(stamps[0]) || stamps[0] !== stamps[1]) throw Error("Callbacks for the same XR frame have different timestamps");
        await new Promise((resolve,reject)=>{
            timer = setTimeout(()=>reject(Error("No tracked stereo pixel sample")),15000);
            const tick = (timestamp,frame) => {
                if (!active) return;
                try {
                    const pose = frame.getViewerPose(space);
                    if (!pose) { session.requestAnimationFrame(tick); return; }
                    if (pose.views.length !== 2 || session.renderState.layers[0] !== layer) throw Error("Stereo projection not active");
                    if (!model) {
                        model = new Float32Array(pose.transform.matrix);
                        for(let i=0;i<3;i++) model[12+i] -= 2*model[8+i];
                    }
                    const matrices = pose.views.map(v=>sampleEye(v,model));
                    packed.set(matrices[0]); packed.set(matrices[1],16);
                    device.queue.writeBuffer(uniforms,0,packed);
                    const subs = pose.views.map(v=>binding.getViewSubImage(layer,v));
                    if (subs.some((s,i)=>s.getViewDescriptor().baseArrayLayer !== i || s.colorTexture !== subs[0].colorTexture ||
                        (withDepth ? s.depthStencilTexture?.format !== "depth24plus" : s.depthStencilTexture !== null))) throw Error("Wrong eye or depth texture");
                    const enc = device.createCommandEncoder();
                    for (let i=0;i<(singlePass?1:2);++i) {
                        const s=subs[i], view=singlePass?{dimension:"2d-array",baseArrayLayer:0,arrayLayerCount:2}:s.getViewDescriptor();
                        const pass=enc.beginRenderPass({...multiview,colorAttachments:[{view:s.colorTexture.createView(view),
                            loadOp:"clear",storeOp:"store",clearValue:[0.05,0.05,0.1,1]}],
                            ...(withDepth?{depthStencilAttachment:{view:s.depthStencilTexture.createView(view),depthLoadOp:"clear",depthClearValue:1,depthStoreOp:"discard"}}:{})});
                        pass.setViewport(s.viewport.x,s.viewport.y,s.viewport.width,s.viewport.height,0,1);
                        pass.setPipeline(pipeline);pass.setBindGroup(0,group);pass.setVertexBuffer(0,vertices);
                        if(withDepth) pass.draw(6,1,0,i);
                        else {pass.draw(3,1,3,i);pass.draw(3,1,0,i);}
                        pass.end();
                    }
                    frames++;
                    begin ??= performance.now();
                    firstTimestamp ??= timestamp;
                    const elapsed=performance.now()-begin;
                    const last = elapsed >= 4000;
                    if(last && Math.abs(timestamp-firstTimestamp-elapsed)>250) throw Error("XR timestamps do not advance in milliseconds");
                    if (last) for (const [i,s] of subs.entries()) {
                        const m=matrices[i], x=(1+m[12]/m[15])/2, y=(1-m[13]/m[15])/2;
                        if(!(m[15]>0 && x>0 && y>0 && x<1 && y<1)) throw Error("World target outside the eye viewport");
                        enc.copyTextureToBuffer({texture:s.colorTexture,
                            origin:[s.viewport.x+Math.floor(x*s.viewport.width),s.viewport.y+Math.floor(y*s.viewport.height),i]},
                            {buffer:readback,offset:4*i},[1,1,1]);
                    }
                    device.queue.submit([enc.finish()]);
                    if (last) resolve(); else session.requestAnimationFrame(tick);
                } catch(e) {reject(e);}
            };
            session.requestAnimationFrame(tick);
        });
        scope=false;
        const error=await device.popErrorScope(); if(error) throw Error(error.message);
        await bounded(readback.mapAsync(GPUMapMode.READ),5000,"Stereo readback timed out");
        const bytes = new Uint8Array(readback.getMappedRange());
        const red = format.startsWith("bgra") ? 2 : 0;
        const blue = 2-red;
        for(let i=0;i<2;i++) {
            const j=i*4;
            if(bytes[j+red]!==255 || bytes[j+1]!==153 || bytes[j+blue]!==[51,56][i]) {
                throw Error("Wrong foreground pixel in eye "+i+": "+bytes.slice(j,j+4));
            }
        }
        readback.unmap();
        return {frames,format,singlePass,withDepth,foveation};
    } finally {
        active = false;
        clearTimeout(timer);
        try {
            if (changed) {
                session.updateRenderState({layers:original});
                await bounded(new Promise(resolve=>session.requestAnimationFrame(resolve)),2000,"Projection restoration timed out");
            }
        } finally {if(scope) await device.popErrorScope(); vertices?.destroy(); uniforms?.destroy(); readback?.destroy(); layer.destroy?.();}
    }
}
