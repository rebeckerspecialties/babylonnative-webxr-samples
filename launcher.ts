import { showMenu } from "sample-menu";
import { attachGripModel } from "./gripModel.mjs";
import { attachFrameRateHud } from "./frameRateHud";
import { bounded, exerciseLayer, inspectionSpace, layerCases, stereoImageCases } from "./composition.mjs";
import { projectionPixels } from "./projectionPixels.mjs";
import { warpFrames } from "./spaceWarp.mjs";
import { densityPixels } from "./densityPixels.mjs";
import { spatialCases, spatialSample } from "./spatial";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import "@babylonjs/loaders/glTF";
import { WebXRDefaultExperience } from "@babylonjs/core/XR/webXRDefaultExperience";
import "@babylonjs/core/XR/features/WebXRLayers";
import "@babylonjs/core/XR/features/WebXRControllerPointerSelection";
import "@babylonjs/core/XR/features/WebXRHandTracking";

// Keep the menu's Babylon scene and its observers out of the reference renderer.
async function prepareLauncher() {
    const native = typeof globalThis.runWebXRSample === "function";
    if (native && typeof globalThis.webxrBenchmarkSpaceWarp === "boolean") {
            try {
                const tracked=globalThis.webxrBenchmarkTracked===true;
                const result=await require("input-selection-page").runBenchmark("app:///Scripts/",globalThis.webxrBenchmarkSpaceWarp,tracked,tracked);
                console.info("XR benchmark finished",result);
            } catch(e) { console.error("XR benchmark FAIL",e.stack || e); }
            return;
    }
    if (native && Array.isArray(globalThis.webxrLayerChecks)) {
        // One owner of renderState/rAF: a Babylon XR camera must not request
        // subimages from its own projection while a raw WebGPU check replaces it.
        const device = await (await navigator.gpu.requestAdapter({xrCompatible:true})).requestDevice();
        const unknown="test-only-unknown-xr-feature";
        try {
            const unexpected=await navigator.xr.requestSession("immersive-vr",{requiredFeatures:[unknown]});
            await unexpected.end();
            throw Error("The runtime granted an unknown required XR feature");
        } catch(e) {
            if(e.name!=="NotSupportedError") throw e;
        }
        const warp = globalThis.webxrLayerChecks.some(n=>n===100 || (n>=102 && n<=104));
        const session = await navigator.xr.requestSession("immersive-vr",{requiredFeatures:["webgpu","layers","local",...(warp?["space-warp"]:[])],optionalFeatures:[unknown]});
        if (session.enabledFeatures.includes(unknown)) throw Error("An unavailable optional feature was granted");
        const binding = new XRGPUBinding(session,device);
        const base = binding.createProjectionLayer({colorFormat:binding.getPreferredColorFormat()});
        session.updateRenderState({layers:[base]});
        const space = await session.requestReferenceSpace("local");
        // These checks run without Babylon or input models. Explicitly render both
        // transparent projection slices; untouched swapchain pixels are not a background.
        let markerPipeline;
        const mark = (pass,sub,eye) => {
            if (!markerPipeline) {
                const module = device.createShaderModule({code:`
                    struct V { @builtin(position) p: vec4f, @location(0) rgb: vec3f }
                    @vertex fn vs(@builtin(vertex_index) i:u32, @builtin(instance_index) eye:u32)->V {
                        let pos=array(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
                        return V(vec4f(pos[i],0,1),select(vec3f(1,0,0),vec3f(0,0,1),eye==1u));
                    }
                    @fragment fn fs(v:V)->@location(0) vec4f {return vec4f(v.rgb,1);}
                `});
                markerPipeline=device.createRenderPipeline({layout:"auto",vertex:{module,entryPoint:"vs"},
                    fragment:{module,entryPoint:"fs",targets:[{format:sub.colorTexture.format}]}});
            }
            const v=sub.viewport;
            pass.setScissorRect(v.x+(v.width*0.41|0),v.y+(v.height*0.41|0),v.width*0.18|0,v.height*0.18|0);
            pass.setPipeline(markerPipeline);
            pass.draw(3,1,0,eye==="right"?1:0);
        };
        const attachment = {view: undefined, loadOp:"clear", storeOp:"store", clearValue:[0,0,0,0]};
        const passDescriptor = {colorAttachments:[attachment]};
        const commands = [undefined];
        const clearForeground = (frame, layer, marker=false) => {
            const pose = frame.getViewerPose(space);
            if (!pose) return;
            const encoder = device.createCommandEncoder();
            const views=pose.views;
            for (let index=0; index<views.length; ++index) {
                const view=views[index];
                const sub = binding.getViewSubImage(layer,view);
                // The descriptor is consumed synchronously; the opaque texture view is frame-local.
                attachment.view=sub.colorTexture.createView(sub.getViewDescriptor());
                const pass=encoder.beginRenderPass(passDescriptor);
                attachment.view=undefined;
                if(marker) mark(pass,sub,view.eye);
                pass.end();
            }
            commands[0]=encoder.finish();
            device.queue.submit(commands);
            commands[0]=undefined;
        };
        // Read one property late: the next device frame must not invalidate the previous JS view.
        let savedView, previousMatrix, savedX;
        await new Promise((resolve,reject)=>{
            function capture(_,frame){
                try {
                    const view=frame.getViewerPose(space)?.views[0];
                    if(!view){session.requestAnimationFrame(capture);return;}
                    savedView=view; previousMatrix=view.projectionMatrix;
                    savedX=view.transform.position.x;
                    resolve(true);
                } catch(e){reject(e);}
            }
            session.requestAnimationFrame(capture);
        });
        await new Promise((resolve,reject)=>session.requestAnimationFrame((_,frame)=>{
            try {
                const current=frame.getViewerPose(space)?.views[0];
                if (!current || savedView===current || savedView.projectionMatrix!==previousMatrix ||
                    savedView.transform.position.x!==savedX || savedView.transform!==savedView.transform ||
                    savedView.transform.inverse.inverse!==savedView.transform)
                    throw Error("XRView snapshot or transform identity lost across frames");
                resolve(true);
            } catch(e){reject(e);}
        }));
        for(const page of globalThis.webxrLayerChecks) {
            const index=(page-3)%26, foveation=page>=29?1:null;
            try {
                console.info("XR check begin", page);
                const checkAlpha = async () => {
                    if(base.blendTextureSourceAlpha !== true) throw Error("Projection alpha blending must default to true");
                    try {
                        base.blendTextureSourceAlpha = page===107;
                        if(base.blendTextureSourceAlpha !== (page===107)) throw Error("Projection alpha setter ignored");
                        return await exerciseLayer(layerCases[2],session,device,await inspectionSpace(session,space),
                            "app:///Scripts/layer-images/",null,false,8000,false,(f,p)=>clearForeground(f,p,true));
                    } finally {base.blendTextureSourceAlpha=true;}
                };
                const result=page>=115 && page<=118 ? await exerciseLayer(stereoImageCases[page-115],session,device,await inspectionSpace(session,space),
                    "app:///Scripts/layer-images/",null,false,20000,false,clearForeground) : page>=111 && page<=114 ? await exerciseLayer(layerCases.find(c=>c[2]===(page%2?"textureVideo":"media")),session,device,
                    await inspectionSpace(session,space),"app:///Scripts/layer-images/",null,false,45000,false,clearForeground,{verifyFilmPixels:false,filmFPS:page<=112?24:30}) :
                    page===109 || page===110 ? await exerciseLayer(layerCases.find(c=>c[2]===(page===109?"textureVideo":"media")),session,device,
                    await inspectionSpace(session,space),"app:///Scripts/layer-images/",null,false,19000,false,clearForeground,{filmFPS:24}) :
                    page===107 || page===108 ? await checkAlpha() : page===105 || page===106 ? await exerciseLayer(layerCases.find(c=>c[2]==="textureVideo"),session,device,
                    await inspectionSpace(session,space),"app:///Scripts/layer-images/",page===106?1:null,false,15000,true,clearForeground) :
                    page===101 ? await densityPixels(session,device,space) : page>=100 ? await warpFrames(session,device,space,["Quad","Cylinder","Equirect"][page-102]) : index<22 ? await exerciseLayer(layerCases[index%11],session,device,await inspectionSpace(session,space),
                    "app:///Scripts/layer-images/",foveation,index>=11,20000,false,clearForeground) :
                    await projectionPixels(session,device,space,index>=24,index%2!==0,foveation);
                console.info("XR layer submitted", JSON.stringify(result));
            } catch(e) {console.error("XR layer FAIL",page,e.message);}
        }
        await session.end();
        device.destroy();
        console.info("XR layer sequence finished");
        return;
    }
    const engine = new WebGPUEngine(document.getElementById("webgpu_canvas"), { xrCompatible: true, audioEngine: false });
    await engine.initAsync();
    const recorder = navigator.gpu?.__babylonNativeRenderPassCommandRecorderProvider;
    if (recorder && "renderPassCommandRecorderProvider" in engine && !engine.renderPassCommandRecorderProvider) {
        engine.renderPassCommandRecorderProvider = recorder;
    }
    if (globalThis.webxrDisableRecorder === true) engine.renderPassCommandRecorderProvider = null;
    const scene = new Scene(engine);
    scene.clearColor.set(0,0,0,0);
    // Controller glTF assets and WebXR grip/target-ray poses use the same right-handed basis.
    scene.useRightHandedSystem = true;
    new HemisphericLight("controller light", Vector3.Up(), scene);
    scene.activeCamera = new FreeCamera("viewer", Vector3.Zero(), scene);
    const xr = await WebXRDefaultExperience.CreateAsync(scene, {
        // The selector handles XR select rays; it has no near-pickable content.
        disableDefaultUI: true, disableTeleportation: true, disableNearInteraction: true,
        inputOptions: { doNotLoadControllerMeshes: true, disableOnlineControllerRepository: true },
    });
    xr.baseExperience.featuresManager.enableFeature("xr-layers", "latest");
    attachFrameRateHud(scene,xr);
    async function loadGrip(handedness: string) {
        const name = handedness === "left" ? "controller-left.gltf" : "controller.gltf";
        const result = await ImportMeshAsync((native ? "app:///Scripts/controller/" : "./controller/") + name, scene, { meshNames: "mesh340565441" });
        if (!result.meshes.some(mesh => mesh.getTotalVertices() > 0)) throw Error("No controller geometry for " + handedness);
        return result.meshes;
    }
    async function attachController(controller) {
        const manager = xr.baseExperience.sessionManager;
        await attachGripModel(controller, loadGrip, manager.onXRFrameObservable, () => manager.referenceSpace);
    }
    xr.input.onControllerAddedObservable.add(c => attachController(c).catch(report));
    for (const c of xr.input.controllers) attachController(c).catch(report);
    const start = async () => {
        await xr.baseExperience.enterXRAsync("immersive-vr", "local", xr.renderTarget, { requiredFeatures: ["webgpu","layers"] });
        engine.runRenderLoop(() => scene.render());
        let busy = false;
        const variants = [null,1].flatMap(foveation=>[
            ...[false,true].flatMap(moving=>layerCases.map(entry=>({entry,foveation,moving}))),
            ...[false,true].flatMap(single=>[false,true].map(depth=>({entry:[(single?"Single-pass":"Two-pass")+" stereo: "+(depth?"color + depth":"color only")],foveation,single,depth})))
        ]);
        for (const entry of stereoImageCases) variants.push({entry, foveation:null, moving:false});
        const titles = ["Stereo projection", "Viewer-relative projection", "Projection layer replacement",
            ...variants.map(v=>v.entry[0]+(v.foveation === null ? "" : " + foveation")+("moving" in v && v.moving ? " + head sweep" : "")),...spatialCases.map(v=>v.title),
            "Input Selection Benchmark","Input Selection Benchmark + space warp"];
        let status = "";
        const initialPage = Number(native ? globalThis.webxrSamplePage : new URL(location.href).searchParams.get("page"));
        let page = Number.isInteger(initialPage) && initialPage >= 0 && initialPage < titles.length ? initialPage : 0;
        const next = () => { if (!busy) { status = ""; page = (page + 1) % titles.length; } };
        const run = async () => {
            if (busy) return;
            busy = true;
            if(page>=titles.length-2) {
                try {
                    await xr.baseExperience.exitXRAsync();
                    try {status=await require("input-selection-page").runBenchmark(native?"app:///Scripts/":"./",page===titles.length-1,true);}
                    finally {await xr.baseExperience.enterXRAsync("immersive-vr","local",xr.renderTarget,{requiredFeatures:["webgpu","layers"]});}
                } catch(e) {status=e.message;console.error("XR benchmark FAIL",e.stack || e);}
                finally {busy=false;menu.refresh?.();}
                return;
            }
            if(page>=3+variants.length) {
                const kind=spatialCases[page-3-variants.length];
                try {
                    if((kind.hit||kind.planes)&&!(await navigator.xr.isSessionSupported("immersive-ar"))) throw Error("Immersive AR unavailable on this device");
                    await xr.baseExperience.exitXRAsync();
                    try {
                        const result=await spatialSample(kind,scene,xr,native?"app:///Scripts/spatial/":"./spatial/");
                        status="Placed: "+result.placements;
                    } finally {await xr.baseExperience.enterXRAsync("immersive-vr","local",xr.renderTarget,{requiredFeatures:["webgpu","layers"]});}
                } catch(e) {status=e.message;console.error("XR spatial FAIL",kind.title,e.message);}
                finally {busy=false;menu.refresh?.();}
                return;
            }
            if (page >= 3) {
                const v = variants[page-3];
                const manager = xr.baseExperience.sessionManager;
                try {
                    let result;
                    if ("single" in v) {
                        await xr.baseExperience.exitXRAsync();
                        try {
                            const raw=await navigator.xr.requestSession("immersive-vr",{requiredFeatures:["webgpu","layers","local"]});
                            try {
                                result=await projectionPixels(raw,engine._device,await raw.requestReferenceSpace("local"),v.single,v.depth,v.foveation);
                            } finally {await raw.end();}
                        } finally {await xr.baseExperience.enterXRAsync("immersive-vr","local",xr.renderTarget,{requiredFeatures:["webgpu","layers"]});}
                    } else {
                        const space=await inspectionSpace(manager.session,manager.referenceSpace);
                        menu.setVisible?.(false);
                        result = await exerciseLayer(v.entry,manager.session,engine._device,space,
                            native ? "app:///Scripts/layer-images/" : "./layer-images/", v.foveation, v.moving,20000,false,undefined,{verifyFilmPixels:false});
                    }
                    status = result.verifiedLayerImages ? "Layer image pixels verified" : "Submitted: " + result.frames + " frames (" + result.fps.toFixed(1) + " FPS)";
                    console.info("XR layer submitted",JSON.stringify(result));
                } catch (e) {
                    status = e.message;
                    console.error("XR layer FAIL",titles[page],e.message);
                } finally {
                    busy = false;
                    menu.setVisible?.(true);
                    menu.refresh?.();
                }
                return;
            }
            menu.dispose();
            await xr.baseExperience.exitXRAsync();
            engine.stopRenderLoop();
            xr.dispose();
            scene.dispose();
            engine.dispose();
            if (native) {
                globalThis.webxrSampleAlignOrigin = page === 1;
                globalThis.webxrSampleReplaceProjection = page === 2;
                globalThis.webxrSamplePage = (page + 1) % titles.length;
                await globalThis.runWebXRSample(() => prepareLauncher().catch(report));
            }
            else location.assign("webgpu/checks.html?launcher=1&page=" + page);
        };
        const menu = showMenu(scene, xr, () => (page + 1) + " / " + titles.length + "   " + titles[page]+(status ? "\n"+status : ""), () => run().catch(report), next);
        console.info("XR launcher ready", titles[page]);
        if (globalThis.webxrInspectImage === true) {
            globalThis.webxrInspectImage=false;
            console.info("XR inspection command recorder",!!engine.renderPassCommandRecorderProvider);
            const manager=xr.baseExperience.sessionManager;
            const viewer=globalThis.webxrInspectGrip === false ? null : await manager.session.requestReferenceSpace("viewer");
            let lastGripSample=-Infinity;
            const gripProbe=viewer && manager.onXRFrameObservable.add(frame=>{
                const now=manager.currentTimestamp;
                if(now-lastGripSample<500) return;
                lastGripSample=now;
                const grips=Array.from(frame.session.inputSources,source=>{
                    const p=source.gripSpace && frame.getPose(source.gripSpace,viewer)?.transform.position;
                    return [source.handedness,p ? [p.x,p.y,p.z].map(n=>Number(n.toFixed(3))) : null];
                });
                console.info("XR inspection grip in viewer space",JSON.stringify(grips));
            });
            // Device pixel fixture only: exercise the real grip glTF/material with
            // a repeatable pose, independently of whether a controller is awake.
            let referenceGrip;
            if (globalThis.webxrReferenceGrip === true) {
                const meshes=await loadGrip("right");
                referenceGrip=new TransformNode("Qualification grip pose",scene);
                referenceGrip.parent=xr.baseExperience.camera;
                referenceGrip.position.set(0,0,-0.45);
                for (const mesh of meshes.filter(mesh=>!mesh.parent)) mesh.parent=referenceGrip;
                for (const mesh of meshes) mesh.isPickable=false;
            }
            await bounded(new Promise(resolve=>{
                const ob=manager.onXRFrameObservable.add(frame=>{
                    if(!frame.getViewerPose(manager.referenceSpace)) return;
                    manager.onXRFrameObservable.remove(ob); resolve(true);
                });
            }),5000,"No tracked menu frame");
            try {await run();} finally {if(gripProbe) manager.onXRFrameObservable.remove(gripProbe);referenceGrip?.dispose(false,true);}
            if (status !== "Layer image pixels verified" && !status.startsWith("Submitted:")) throw Error("Menu layer inspection failed: "+status);
            console.info("XR image inspection returned", titles[page]);
        }
        if (globalThis.webxrProjectionRoundTrip === true) {
            const manager=xr.baseExperience.sessionManager;
            const original=manager.session;
            const tracked=()=>bounded(new Promise(resolve=>{
                const ob=manager.onXRFrameObservable.add(frame=>{
                    if(!frame.getViewerPose(manager.referenceSpace)) return;
                    manager.onXRFrameObservable.remove(ob); resolve(true);
                });
            }),5000,"No tracked menu frame");
            await tracked();
            await run();
            if(!status.startsWith("Submitted:") || original===manager.session)
                throw Error("Projection menu roundtrip failed: "+status);
            await tracked();
            console.info("XR projection menu returned",titles[page]);
        }
        // Desk qualification drives the very same callbacks as the controls, after rendering.
        if (globalThis.webxrCheckMenuHandoff === true) {
            for (const hand of ["left", "right"]) {
                const meshes = await loadGrip(hand);
                for (const mesh of meshes) mesh.dispose(false, true);
                console.info("XR grip asset PASS", hand);
            }
            let count = 0;
            const handle = scene.onAfterRenderObservable.add(() => {
                if (++count !== 120) return;
                scene.onAfterRenderObservable.remove(handle);
                globalThis.webxrCheckMenuHandoff = false;
                globalThis.webxrCheckMenuReturn = true;
                next();
                run().catch(report);
            });
        }
    };
    if (native) await start();
    else {
        const enter = document.getElementById("enter") as HTMLButtonElement;
        enter.disabled = false;
        enter.onclick = () => start().catch(report);
    }
}
function report(e) { console.error("XR launcher FAIL", e.stack || e); }
prepareLauncher().catch(report);
