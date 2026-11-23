import { bounded } from "./composition.mjs";
// Compare a single array draw with two eye draws before compositor submission.
// The image is deliberately head-locked: the sentinel checks eye routing, not head tracking.
export async function projectionPixels(session, device, space, singlePass, withDepth, foveation) {
    if (singlePass && !device._nativeFeatures?.has("xr-stereo-multiview")) throw Error("Single-pass multiview unavailable");
    const binding = new XRGPUBinding(session,device), format = binding.getPreferredColorFormat();
    const original = Array.from(session.renderState.layers);
    const layer = binding.createProjectionLayer({colorFormat:format,
        ...(withDepth ? {depthStencilFormat:"depth24plus"} : {}),
        textureUsage:GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC});
    let readback, changed = false, active = true, timer;
    try {
        if (foveation !== null) {
            if (layer.fixedFoveation == null) throw Error("Projection fixed foveation unsupported");
            layer.fixedFoveation = foveation;
            if (layer.fixedFoveation !== foveation) throw Error("Foveation not retained");
        }
        const module = device.createShaderModule({ code:`
struct V { @builtin(position) p:vec4f, @location(0) @interpolate(flat) eye:u32 };
@vertex fn vs(@builtin(vertex_index) i:u32, @builtin(${singlePass ? "view_index" : "instance_index"}) eye:u32)->V {
    let xy=array<vec2f,3>(vec2f(-0.75,-0.7),vec2f(0.75,-0.7),vec2f(0,0.8));
    return V(vec4f(xy[i],0.5,1),eye);
}
@fragment fn fs(v:V)->@location(0) vec4f {return select(vec4f(1,0,0,1),vec4f(0,1,0,1),v.eye!=0u);}
`});
        const multiview = singlePass ? {_xrViewCount:2} : {};
        const pipeline = await bounded(device.createRenderPipelineAsync({layout:"auto",...multiview,
            vertex:{module,entryPoint:"vs"},fragment:{module,entryPoint:"fs",targets:[{format}]},
            ...(withDepth ? {depthStencil:{format:"depth24plus",depthWriteEnabled:true,depthCompare:"less"}} : {})}),15000,"Stereo pipeline creation timed out");
        readback = device.createBuffer({size:512,usage:GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ});
        session.updateRenderState({layers:[layer]}); changed = true;
        let frames = 0, begin;
        await new Promise((resolve,reject)=>{
            timer = setTimeout(()=>reject(Error("No tracked stereo pixel sample")),15000);
            const tick = (_,frame) => {
                if (!active) return;
                try {
                    const pose = frame.getViewerPose(space);
                    if (!pose) { session.requestAnimationFrame(tick); return; }
                    if (pose.views.length !== 2 || session.renderState.layers[0] !== layer) throw Error("Stereo projection not active");
                    const subs = pose.views.map(v=>binding.getViewSubImage(layer,v));
                    if (subs.some((s,i)=>s.getViewDescriptor().baseArrayLayer !== i || s.colorTexture !== subs[0].colorTexture ||
                        (withDepth ? s.depthStencilTexture?.format !== "depth24plus" : s.depthStencilTexture !== null))) throw Error("Wrong eye or depth texture");
                    const enc = device.createCommandEncoder();
                    for (let i=0;i<(singlePass?1:2);++i) {
                        const s=subs[i], view=singlePass?{dimension:"2d-array",baseArrayLayer:0,arrayLayerCount:2}:s.getViewDescriptor();
                        const pass=enc.beginRenderPass({...multiview,colorAttachments:[{view:s.colorTexture.createView(view),
                            loadOp:"clear",storeOp:"store",clearValue:[0.05,0.05,0.1,1]}],
                            ...(withDepth?{depthStencilAttachment:{view:s.depthStencilTexture.createView(view),depthLoadOp:"clear",depthClearValue:1,depthStoreOp:"discard"}}:{})});
                        pass.setPipeline(pipeline);pass.draw(3,1,0,i);pass.end();
                    }
                    frames++;
                    begin ??= performance.now();
                    const last = performance.now()-begin >= 4000;
                    if (last) for (const [i,s] of subs.entries()) enc.copyTextureToBuffer({texture:s.colorTexture,
                        origin:[Math.floor(s.viewport.width/2)+s.viewport.x,Math.floor(s.viewport.height/2)+s.viewport.y,i]},
                        {buffer:readback,offset:256*i,bytesPerRow:256},[1,1,1]);
                    device.queue.submit([enc.finish()]);
                    if (last) resolve(); else session.requestAnimationFrame(tick);
                } catch(e) {reject(e);}
            };
            session.requestAnimationFrame(tick);
        });
        await bounded(readback.mapAsync(GPUMapMode.READ),5000,"Stereo readback timed out");
        const bytes = new Uint8Array(readback.getMappedRange());
        const red = format.startsWith("bgra") ? 2 : 0;
        if (bytes[red] !== 255 || bytes[1] !== 0 || bytes[256+red] !== 0 || bytes[257] !== 255)
            throw Error("Incorrect stereo pixel pair: "+[...bytes.slice(0,4)]+"/"+[...bytes.slice(256,260)]);
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
        } finally {readback?.destroy(); layer.destroy?.();}
    }
}
