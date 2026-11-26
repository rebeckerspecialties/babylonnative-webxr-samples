import {bounded} from "./composition.mjs";

// Count alternating pixel edges in 16x16 windows. Coarse fragment shading
// repeats the shader output without changing the eye texture's dimensions.
export function edges(bytes, offset) {
    let changes = 0;
    for (let y=0; y<16; ++y) for (let x=1; x<16; ++x) {
        const n=offset+y*256+x*4;
        if (Math.abs(bytes[n]-bytes[n-4])>127) ++changes;
    }
    return changes;
}

export async function densityPixels(session, device, space) {
    const binding = new XRGPUBinding(session,device), format=binding.getPreferredColorFormat();
    const original=Array.from(session.renderState.layers);
    const layer=binding.createProjectionLayer({colorFormat:format,textureUsage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
    const module=device.createShaderModule({code:`
        @vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f {
            return vec4f(vec2f(f32((i<<1u)&2u),f32(i&2u))*2.-1.,0.,1.);
        }
        @fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f {
            return vec4f(vec3f(f32((u32(p.x)^u32(p.y))&1u)),1.);
        }`});
    const pipeline=await device.createRenderPipelineAsync({layout:"auto",vertex:{module,entryPoint:"vs"},fragment:{module,entryPoint:"fs",targets:[{format}]}});
    const read=device.createBuffer({size:4*4096,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    const counts=[];
    try {
        session.updateRenderState({layers:[layer]});
        for (const level of [0,1,0]) {
            layer.fixedFoveation=level;
            if (layer.fixedFoveation!==level) throw Error("Foveation unavailable at the recommended eye extent");
            for(let k=0;k<5;k++) {
                await bounded(new Promise((ok,fail)=>session.requestAnimationFrame(function tick(_,frame) {
                    try {
                        const pose=frame.getViewerPose(space);
                        if(!pose) {session.requestAnimationFrame(tick);return;}
                        const enc=device.createCommandEncoder();
                        if(pose.views.length!==2) throw Error("Expected stereo");
                        for(const [i,v] of pose.views.entries()) {
                            const s=binding.getViewSubImage(layer,v), tex=s.colorTexture;
                            const pass=enc.beginRenderPass({colorAttachments:[{view:tex.createView(s.getViewDescriptor()),loadOp:"clear",storeOp:"store",clearValue:[0,0,0,1]}]});
                            pass.setPipeline(pipeline);pass.draw(3);pass.end();
                            if(k===4) for(const [j,f] of [0.5,0.93].entries()) {
                                enc.copyTextureToBuffer({texture:tex,origin:[Math.floor(tex.width*f)-8,Math.floor(tex.height*f)-8,i]},
                                    {buffer:read,offset:(i*2+j)*4096,bytesPerRow:256},[16,16,1]);
                            }
                        }
                        device.queue.submit([enc.finish()]);ok();
                    } catch(e){fail(e);}
                })), 6000, "Foveated eye did not render");
            }
            await bounded(read.mapAsync(GPUMapMode.READ),4000,"Foveated eye readback timed out");
            try { const bytes=new Uint8Array(read.getMappedRange()); counts.push([0,1,2,3].map(i=>edges(bytes,i*4096))); }
            finally {read.unmap();}
        }
        for(const eye of [0,2]) {
            if(counts[0][eye]!==240 || counts[0][eye+1]!==240 || counts[1][eye]!==240 || counts[1][eye+1]>=200 ||
               counts[2][eye]!==240 || counts[2][eye+1]!==240)
                throw Error("Eye shading did not change only in the periphery: "+JSON.stringify(counts));
        }
        return {frames:15,alternatingEdges:counts};
    } finally {
        layer.fixedFoveation=0;session.updateRenderState({layers:original});read.destroy();
    }
}
