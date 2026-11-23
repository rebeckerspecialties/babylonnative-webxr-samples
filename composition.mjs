import {trackHeadSweep} from "./headMotion.mjs";

export function uploadPackedVideo(queue,video,left,right) {
    const a=left.viewport, b=right.viewport;
    const slice=left.getViewDescriptor().baseArrayLayer??0;
    if(left.colorTexture!==right.colorTexture || slice!==(right.getViewDescriptor().baseArrayLayer??0) ||
       a.x!==b.x || b.y!==a.y+a.height || a.width!==b.width || a.height!==b.height ||
       a.width!==video.videoWidth || 2*a.height!==video.videoHeight)
        throw Error("Top/bottom video layout does not match the two reported eye viewports");
    queue.copyExternalImageToTexture({source:video},{texture:left.colorTexture,origin:[a.x,a.y,slice]},[a.width,2*a.height]);
}
// Browser and native use the same binding. Never draw a mesh as a stand-in for a compositor layer.
const assets = {Quad:"rect-mono.png", Cylinder:"rect-mono.png", Equirect:"mono_equirect_test.png", Cube:"mono_cube_map.png"};
export const layerCases = [
    ["Quad image", ["Quad"]], ["Cylinder image", ["Cylinder"]], ["Equirect image", ["Equirect"]],
    ["Cube faces", ["Cube"]], ["Quad + cylinder", ["Quad","Cylinder"]], ["Destroy quad", ["Quad"], "destroy"],
    ["Select one of two quads", ["Quad","Quad"], "select"], ["Video on equirect texture", ["Equirect"], "textureVideo"],
    ["Media equirect", ["Equirect"], "media"], ["Media cylinder", ["Cylinder"], "media"], ["Media quad", ["Quad"], "media"],
];
export function requireFactories(binding, kinds) {
    for (const kind of kinds) if (typeof binding["create"+kind+"Layer"] !== "function")
        throw Error("Missing " + binding.constructor.name + ".create" + kind + "Layer");
}
export function bounded(promise, ms, label) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error(label)), ms); })])
        .finally(() => clearTimeout(timer));
}
function loadImage(url) {
    const image = new Image();
    return bounded(new Promise((resolve,reject) => {
        image.onload = () => resolve(image);
        image.onerror = () => reject(Error("Could not decode " + url));
        image.src = url;
    }), 15000, "Timed out loading " + url);
}
export async function exerciseLayer(entry, session, device, space, baseURL, foveation, moving = false) {
    const [title,kinds,operation] = entry;
    const original = Array.from(session.renderState.layers);
    const projection = original.find(layer => layer instanceof XRProjectionLayer);
    if (!projection) throw Error("Missing active projection");
    const oldFoveation = projection.fixedFoveation;
    const gpu = new XRGPUBinding(session,device);
    const media = operation === "media";
    if (media && typeof XRMediaBinding !== "function") throw Error("Missing XRMediaBinding");
    const factory = media ? new XRMediaBinding(session) : gpu;
    requireFactories(factory,kinds);
    const owned = [];
    const useVideo = media || operation === "textureVideo";
    let video, changed = false, foveationChanged = false, active = true, select;
    try {
        if (foveation !== null) {
            if (oldFoveation == null) throw Error("Projection fixed foveation unsupported");
            projection.fixedFoveation = foveation;
            foveationChanged = true;
            if (projection.fixedFoveation !== foveation) throw Error("Foveation request not retained");
        }
        if (useVideo) {
            video = document.createElement("video");
            video.crossOrigin = "anonymous"; video.loop = true; video.muted = true; video.playsInline = true;
            video.src = baseURL + "bbb-sunflower-540p2-1min.webm";
            await bounded(video.play(),15000,"Media did not start");
        }
        for (const [i,kind] of kinds.entries()) {
            const transform = new XRRigidTransform({x:kinds.length===1 ? 0 : i-0.5,y:0,z:kind==="Quad"?-2:0});
            const options = {space,layout:useVideo ? "stereo-top-bottom" : "mono"};
            if (kind !== "Cube") options.transform = transform;
            if (kind === "Quad") Object.assign(options,{width:2,height:1});
            if (kind === "Cylinder") Object.assign(options,{radius:2,centralAngle:1,aspectRatio:2});
            const image = useVideo ? video : await loadImage(baseURL + assets[kind]);
            const height = useVideo ? image.videoHeight/2 : image.height;
            const width = useVideo ? image.videoWidth : kind === "Cube" ? height : image.width;
            if (!width || !height) throw Error("Source has no decoded dimensions");
            if (!media) Object.assign(options,{colorFormat:gpu.getPreferredColorFormat(),viewPixelWidth:width,viewPixelHeight:height,
                isStatic:!useVideo,textureUsage:GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST});
            const layer = media ? factory["create"+kind+"Layer"](video,options) : factory["create"+kind+"Layer"](options);
            owned.push({layer,image,width,height,kind});
        }
        const layers = owned.map(x=>x.layer);
        let requested = [...original,...layers];
        session.updateRenderState({layers:requested}); changed = true;
        let firstTime, videoTime, count = 0;
        let selected = false, pendingSelection;
        if (operation === "select") {
            // Two adjacent, world-fixed half-metre panels. Input is the event's aim, never the grip.
            layers.forEach((l,i)=>{ l.width=0.5; l.height=0.5; l.transform=new XRRigidTransform({x:i-0.5,y:0,z:-2}); });
            select = event => {
                const m = event.frame.getPose(event.inputSource.targetRaySpace,space)?.transform.matrix;
                if (!m || m[10] <= 0) return;
                const t=(m[14]+2)/m[10], x=m[12]-t*m[8], y=m[13]-t*m[9];
                const hit = layers.findIndex((_,i)=> Math.abs(x-(i-0.5))<=0.25);
                if (hit<0 || t<0 || Math.abs(y)>0.25) return;
                pendingSelection = layers[hit];
            };
            session.addEventListener("select",select);
        }
        const validation = [];
        const sweep = moving ? trackHeadSweep() : null;
        await bounded(new Promise((resolve,reject) => {
            const frame = (time, xr) => {
                if (!active) return;
                try {
                    if (!requested.every((l,i)=>session.renderState.layers[i]===l) || session.renderState.layers.length!==requested.length)
                        throw Error("Wrong ordered layers at next frame");
                    firstTime ??= performance.now();
                    if (sweep) sweep.observe(xr.getViewerPose(space));
                    if (useVideo) videoTime ??= video.currentTime;
                    for (const item of owned) {
                        if (media || !requested.includes(item.layer) || (!useVideo && !item.layer.needsRedraw)) continue;
                        const faces = item.kind === "Cube" ? 6 : 1;
                        device.pushErrorScope("validation");
                        try { if(useVideo) {
                            uploadPackedVideo(device.queue,item.image,gpu.getSubImage(item.layer,xr,"left"),gpu.getSubImage(item.layer,xr,"right"));
                        } else {
                            const sub = gpu.getSubImage(item.layer,xr,"none");
                            const descriptor = sub.getViewDescriptor();
                            for (let i=0;i<faces;i++) device.queue.copyExternalImageToTexture(
                            {source:item.image,origin:[i*item.width,0]},
                            {texture:sub.colorTexture,origin:[sub.viewport.x,sub.viewport.y,(descriptor.baseArrayLayer??0)+i]},
                            [item.width,item.height]);
                        } }
                        finally { validation.push(device.popErrorScope()); }
                        item.uploaded = true;
                    }
                    count++;
                    // Select events may run before rAF in the same XR frame. Only
                    // compare active renderState on the frame after we queue its update.
                    if (pendingSelection) {
                        requested = [...original,pendingSelection];
                        pendingSelection = undefined;
                        session.updateRenderState({layers:requested});
                        selected = true;
                        session.requestAnimationFrame(frame);
                        return;
                    }
                    if (performance.now()-firstTime < 8000 || (select && !selected) || (sweep && sweep.result().degrees < 15)) { session.requestAnimationFrame(frame); return; }
                    if (useVideo && !(video.currentTime !== videoTime && video.readyState >= 2) || !media && owned.some(item=>!item.uploaded))
                        throw Error(media ? "No decoded video advance" : "No redraw/upload");
                    resolve();
                } catch(e) { reject(e); }
            };
            session.requestAnimationFrame(frame);
        }),select || moving ? 60000 : 20000,select ? "No quad selection or required motion confirmed" : moving ? "No 15-degree tracked head sweep" : "No visible layer frames");
        const errors = (await bounded(Promise.all(validation),5000,"GPU validation timed out")).filter(Boolean);
        if (errors.length) throw Error(errors[0].message);
        if (operation === "destroy") {
            layers[0].destroy(); owned[0].destroyed = true;
            let error;
            try { session.updateRenderState({layers:requested}); } catch(e) { error = e; }
            if (error?.name !== "InvalidStateError") throw Error("Destroyed layer was not rejected with InvalidStateError");
        }
        return {title,frames:count,foveation,mediaSeconds:video?.currentTime,headSweep:sweep?.result()};
    } finally {
        active = false;
        if (select) session.removeEventListener("select",select);
        try {
            if (changed) {
                session.updateRenderState({layers:original});
                await bounded(new Promise(resolve=>session.requestAnimationFrame(resolve)),2000,"Projection restoration timed out");
            }
        } finally {
            if (foveationChanged) projection.fixedFoveation = oldFoveation;
            for (const item of owned) if (!item.destroyed) item.layer.destroy();
            if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
        }
    }
}
