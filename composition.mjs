import {trackHeadSweep} from "./headMotion.mjs";
import {referenceRGB} from "./videoReference.mjs";
import {XRFrameRate} from "./frameRate.mjs";

// WebXR composites back to front. Preserve the order of existing overlays and underlays.
export function insertBackgrounds(original, projection, backgrounds) {
    const i = original.indexOf(projection);
    if (i < 0) throw Error("Missing foreground projection");
    return [...original.slice(0,i), ...backgrounds, ...original.slice(i)];
}

export function uploadPackedVideo(queue,video,left,right) {
    const a=left.viewport, b=right.viewport;
    const slice=left.getViewDescriptor().baseArrayLayer??0;
    if(left.colorTexture!==right.colorTexture || slice!==(right.getViewDescriptor().baseArrayLayer??0) ||
       a.x!==b.x || b.y!==a.y+a.height || a.width!==b.width || a.height!==b.height ||
       a.width!==video.videoWidth || 2*a.height!==video.videoHeight)
        throw Error("Top/bottom video layout does not match the two reported eye viewports");
    queue.copyExternalImageToTexture({source:video},{texture:left.colorTexture,origin:[a.x,a.y,slice]},[a.width,2*a.height]);
}

// This packaged CFR clip has its first video PTS at 70 ms and 30 frames/s.
// Prefer decoder notifications; use its known timeline on older video elements.
export function filmFrames(video, fps=30, firstPTS=.070) {
    let token=0, callback, previous;
    const notified=typeof video.requestVideoFrameCallback==="function" && typeof video.cancelVideoFrameCallback==="function";
    const schedule=()=>{callback=video.requestVideoFrameCallback((_,metadata)=>{token=metadata.presentedFrames; schedule();});};
    if(notified) schedule();
    return {
        changed(time) {
            const current=notified ? token : Math.max(0,Math.floor((time-firstPTS)*fps+1e-6));
            if(previous===current) return false;
            previous=current;
            return true;
        },
        close(){ if(notified) video.cancelVideoFrameCallback(callback); },
    };
}

export async function requestFilmRate(session, rate) {
    await session.updateTargetFrameRate(rate);
    // Acceptance precedes the OpenXR rate-change event. Do not start another
    // sample (or another restore request) based on the old nominal rate.
    for(let i=0;i<120;i++) {
        await bounded(new Promise(resolve=>session.requestAnimationFrame(resolve)),2000,"No XR frame during refresh change");
        if(session.frameRate===rate) return;
    }
    throw Error("Display did not switch to "+rate+" Hz");
}
// The source clip is stereo 16:9 film, not a 360-degree panorama. Preserve its
// pixel aspect on a bounded patch of the equirect layer rather than magnifying a sky pixel.
export function videoAngles(width, eyeHeight) {
    const horizontal=Math.PI/2, halfHeight=horizontal*eyeHeight/(2*width);
    return {centralHorizontalAngle:horizontal, lowerVerticalAngle:-halfHeight, upperVerticalAngle:halfHeight};
}
export function compareStereoRGB(actual, time, references=referenceRGB) {
    let best;
    for(let i=0;i<references.length;i++) {
        if(Math.abs(12+i/6-time)>0.55) continue;
        const hex=references[i], expected=Uint8Array.from(hex.match(/../g),v=>parseInt(v,16));
        if(expected.length!==actual.length || actual.length%6!==0) throw Error("Invalid stereo reference dimensions");
        const half=actual.length/2, error=[0,0];
        let dot=0, aa=0, bb=0;
        for(let j=0;j<half;j++) {
            const x=actual[j]-actual[j+half], y=expected[j]-expected[j+half];
            dot+=x*y; aa+=x*x; bb+=y*y;
            error[0]+=Math.abs(actual[j]-expected[j]);error[1]+=Math.abs(actual[j+half]-expected[j+half]);
        }
        const mae=error.map(n=>n/half), disparity=dot/Math.sqrt(aa*bb || 1);
        if(!best || Math.max(...mae)<Math.max(...best.mae)) best={referenceTime:12+i/6,mae,disparity};
    }
    if(!best || Math.max(...best.mae)>18 || best.disparity<0.25)
        throw Error("Compositor video disagrees with left/right VP8 reference at "+time+": "+JSON.stringify(best));
    return best;
}
async function inspectVideo(device,sub,time) {
    const v=sub.viewport, texture=sub.colorTexture, slice=sub.getViewDescriptor().baseArrayLayer??0;
    const stride=Math.ceil(v.width*4/256)*256;
    const buffer=device.createBuffer({size:stride*v.height*2,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try {
        const encoder=device.createCommandEncoder();
        encoder.copyTextureToBuffer({texture,origin:[v.x,v.y,slice]}, {buffer,bytesPerRow:stride},[v.width,v.height*2]);
        device.queue.submit([encoder.finish()]);
        await bounded(buffer.mapAsync(GPUMapMode.READ),5000,"Video compositor texture readback timed out");
        try {
            const bytes=new Uint8Array(buffer.getMappedRange()), rgb=new Uint8Array(24*24*3);
            const r=texture.format.startsWith("bgra")?2:0;
            for(let y=0,i=0;y<24;y++) for(let x=0;x<24;x++) {
                const p=Math.floor((y+.5)*v.height*2/24)*stride+Math.floor((x+.5)*v.width/24)*4;
                rgb[i++]=bytes[p+r];rgb[i++]=bytes[p+1];rgb[i++]=bytes[p+2-r];
            }
            return compareStereoRGB(rgb,time);
        } finally {buffer.unmap();}
    } finally {buffer.destroy();}
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
// Capture once, not every frame: the sample starts in view and remains world-fixed.
export function inspectionSpace(session, base) {
    return new Promise((resolve,reject)=>{
        let id;
        const timer=setTimeout(()=>{session.cancelAnimationFrame?.(id);reject(Error("No tracked viewer for layer placement"));},5000);
        function place(_,frame) {
            try {
                const pose=frame.getViewerPose(base);
                if (!pose) {id=session.requestAnimationFrame(place); return;}
                clearTimeout(timer);
                resolve(base.getOffsetReferenceSpace(pose.transform));
            } catch(e) {clearTimeout(timer);reject(e);}
        }
        id=session.requestAnimationFrame(place);
    });
}
// Known opaque texels in the upstream rect-mono.png. Comparing channel ordering
// and contrast allows both linear and sRGB storage without accepting a blank image.
export function checkRectPixels(bytes,format) {
    const r=format.startsWith("bgra")?2:0, b=2-r;
    if(bytes.length!==16 || [3,7,11,15].some(i=>bytes[i]<245) ||
       !(bytes[4+r]>bytes[4+b]+12 && bytes[4+r]>bytes[r]+12 &&
         bytes[13]>bytes[1]+10 && bytes[9]>bytes[1]+3))
        throw Error("Uploaded compositor layer does not contain rect-mono.png texels: "+Array.from(bytes));
}
async function inspectRect(device,sub) {
    const points=[[50,50],[400,750],[810,540],[1450,890]];
    const read=device.createBuffer({size:16,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try {
        const enc=device.createCommandEncoder(), slice=sub.getViewDescriptor().baseArrayLayer??0, format=sub.colorTexture.format;
        points.forEach(([x,y],i)=>enc.copyTextureToBuffer({texture:sub.colorTexture,
            origin:[sub.viewport.x+x,sub.viewport.y+y,slice]}, {buffer:read,offset:i*4},[1,1]));
        device.queue.submit([enc.finish()]);
        await bounded(read.mapAsync(GPUMapMode.READ),5000,"Layer image readback timed out");
        try {checkRectPixels(new Uint8Array(read.getMappedRange()),format);}
        finally {read.unmap();}
    } finally {read.destroy();}
}
export async function exerciseLayer(entry, session, device, space, baseURL, foveation, moving = false, duration=8000, identifyEyes=false, drawForeground, {verifyFilmPixels=true, filmFPS=30}={}) {
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
    let film, uploads=0;
    const initialRate=session.frameRate;
    const targetRate=filmFPS===24 ? 72 : 60;
    const matchFilm=useVideo && initialRate>0 && initialRate!==targetRate && session.supportedFrameRates?.includes(targetRate) && typeof session.updateTargetFrameRate==="function";
    let rateChanged=false;
    try {
        if(matchFilm) { rateChanged=true; await requestFilmRate(session,targetRate); }
        if (foveation !== null) {
            if (oldFoveation == null) throw Error("Projection fixed foveation unsupported");
            projection.fixedFoveation = foveation;
            foveationChanged = true;
            if (projection.fixedFoveation !== foveation) throw Error("Foveation request not retained");
        }
        if (useVideo) {
            video = document.createElement("video");
            video.crossOrigin = "anonymous"; video.loop = true; video.muted = true; video.playsInline = true;
            video.src = baseURL + (filmFPS===24 ? "bbb-stereo-24fps.webm" : "bbb-sunflower-540p2-1min.webm");
            await bounded(video.play(),15000,"Media did not start");
            if(!media) film=filmFrames(video,filmFPS,filmFPS===24 ? .087 : .070);
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
            if (kind==="Equirect" && useVideo) Object.assign(options,videoAngles(width,height));
            if (!media) Object.assign(options,{colorFormat:gpu.getPreferredColorFormat(),viewPixelWidth:width,viewPixelHeight:height,
                isStatic:!useVideo,textureUsage:GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_DST |
                    ((useVideo ? verifyFilmPixels : assets[kind]==="rect-mono.png") ? GPUTextureUsage.COPY_SRC : 0)});
            const layer = media ? factory["create"+kind+"Layer"](video,options) : factory["create"+kind+"Layer"](options);
            owned.push({layer,image,width,height,kind});
        }
        const layers = owned.map(x=>x.layer);
        let requested = insertBackgrounds(original,projection,layers);
        session.updateRenderState({layers:requested}); changed = true;
        let firstTime, videoTime, count = 0;
        const cadence = new XRFrameRate(session.frameRate);
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
        const inspections = [];
        const videoSamples=[];
        let eyeMarkers;
        if (operation==="textureVideo") duration=Math.max(duration,15000*30/filmFPS);
        let inspectError;
        const sweep = moving ? trackHeadSweep() : null;
        await bounded(new Promise((resolve,reject) => {
            const frame = (time, xr) => {
                if (!active) return;
                try {
                    if (inspectError) throw inspectError;
                    if (!requested.every((l,i)=>session.renderState.layers[i]===l) || session.renderState.layers.length!==requested.length)
                        throw Error("Wrong ordered layers at next frame");
                    firstTime ??= performance.now();
                    cadence.sample(time);
                    if (drawForeground) drawForeground(xr,projection);
                    if (sweep) sweep.observe(xr.getViewerPose(space));
                    if (useVideo) videoTime ??= video.currentTime;
                    const movieTime=film ? video.currentTime : 0;
                    const newFrame=film?.changed(movieTime);
                    for (const item of owned) {
                        if (media || !requested.includes(item.layer) || (!useVideo && !item.layer.needsRedraw)) continue;
                        // Leave the last released image with the compositor; never acquire
                        // a rotating destination and then skip writing its pixels.
                        if(useVideo && !newFrame && item.uploaded) continue;
                        const faces = item.kind === "Cube" ? 6 : 1;
                        const scoped=!useVideo || verifyFilmPixels;
                        if(scoped) device.pushErrorScope("validation");
                        try { if(useVideo) {
                            const left=gpu.getSubImage(item.layer,xr,"left"), now=movieTime;
                            const right=gpu.getSubImage(item.layer,xr,"right");
                            uploadPackedVideo(device.queue,item.image,left,right);
                            uploads++;
                            const referenceTime=now*filmFPS/30;
                            if(verifyFilmPixels && videoSamples.length<2 && referenceTime>=12.5+videoSamples.length) {
                                videoSamples.push(inspectVideo(device,left,referenceTime).catch(e=>{inspectError=e;}));
                            }
                            if (identifyEyes) {
                                // Qualification only: the clean texture read above is ordered before
                                // these writes. Only an external display capture can verify eye routing.
                                eyeMarkers ??= [[255,0,255,255],left.colorTexture.format.startsWith("bgra")?[255,255,0,255]:[0,255,255,255]]
                                    .map(rgba=>{const a=new Uint8Array(48*48*4);for(let i=0;i<a.length;i+=4)a.set(rgba,i);return a;});
                                [left,right].forEach((eye,i)=>{
                                    const v=eye.viewport;
                                    device.queue.writeTexture({texture:eye.colorTexture,origin:[v.x+Math.floor(v.width/2)-24,
                                        v.y+Math.floor(v.height/2)-24,eye.getViewDescriptor().baseArrayLayer??0]},
                                        eyeMarkers[i],{bytesPerRow:48*4},[48,48]);
                                });
                            }
                        } else {
                            const sub = gpu.getSubImage(item.layer,xr,"none");
                            const descriptor = sub.getViewDescriptor();
                            for (let i=0;i<faces;i++) device.queue.copyExternalImageToTexture(
                            {source:item.image,origin:[i*item.width,0]},
                            {texture:sub.colorTexture,origin:[sub.viewport.x,sub.viewport.y,(descriptor.baseArrayLayer??0)+i]},
                            [item.width,item.height]);
                            if (!item.uploaded && assets[item.kind]==="rect-mono.png")
                                inspections.push(inspectRect(device,sub).catch(e=>{inspectError=e;}));
                        } }
                        finally { if(scoped) validation.push(device.popErrorScope()); }
                        item.uploaded = true;
                    }
                    if (++count === 1) console.info("XR displaying layer",title);
                    // Select events may run before rAF in the same XR frame. Only
                    // compare active renderState on the frame after we queue its update.
                    if (pendingSelection) {
                        requested = insertBackgrounds(original,projection,[pendingSelection]);
                        pendingSelection = undefined;
                        session.updateRenderState({layers:requested});
                        selected = true;
                        session.requestAnimationFrame(frame);
                        return;
                    }
                    if (performance.now()-firstTime < duration || (select && !selected) || (sweep && sweep.result().degrees < 15)) { session.requestAnimationFrame(frame); return; }
                    if (useVideo && !(video.currentTime !== videoTime && video.readyState >= 2))
                        throw Error("No video advance: start="+videoTime+" end="+video.currentTime+" readyState="+video.readyState+" uploads="+uploads);
                    if (!media && owned.some(item=>!item.uploaded)) throw Error("No redraw/upload");
                    resolve();
                } catch(e) { reject(e); }
            };
            session.requestAnimationFrame(frame);
        }),select || moving ? 60000 : duration+12000,select ? "No quad selection or required motion confirmed" : moving ? "No 15-degree tracked head sweep" : "No layer frames");
        await Promise.all(inspections);
        if (inspectError) throw inspectError;
        const errors = (await bounded(Promise.all(validation),5000,"GPU validation timed out")).filter(Boolean);
        if (errors.length) throw Error(errors[0].message);
        if (operation === "destroy") {
            layers[0].destroy(); owned[0].destroyed = true;
            let error;
            try { session.updateRenderState({layers:requested}); } catch(e) { error = e; }
            if (error?.name !== "InvalidStateError") throw Error("Destroyed layer was not rejected with InvalidStateError");
        }
        const stereoReference=await Promise.all(videoSamples);
        if(inspectError) throw inspectError;
        if(operation==="textureVideo" && verifyFilmPixels && stereoReference.length!==2) throw Error("Missing timed stereo video references");
        return {title,frames:count,fps:cadence.average,displayHz:session.frameRate,steadyIntervals:cadence.steadyIntervals,
            missedRefreshes:cadence.missed,maxGapMs:cadence.maxGapMs,foveation,uploads,mediaSeconds:video?.currentTime,headSweep:sweep?.result(),stereoReference,verifiedLayerImages:inspections.length};
    } finally {
        active = false;
        if (select) session.removeEventListener("select",select);
        try {
            if (changed) {
                session.updateRenderState({layers:original});
                await bounded(new Promise(resolve=>session.requestAnimationFrame(resolve)),2000,"Projection restoration timed out");
            }
        } finally {
            film?.close();
            if (foveationChanged) projection.fixedFoveation = oldFoveation;
            for (const item of owned) if (!item.destroyed) item.layer.destroy();
            if (video) { video.pause(); video.removeAttribute("src"); video.load(); }
            if (rateChanged) await requestFilmRate(session,initialRate);
        }
    }
}
