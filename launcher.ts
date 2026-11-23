import { showMenu } from "sample-menu";
import { attachGripModel } from "./gripModel.mjs";
import { exerciseLayer, layerCases } from "./composition.mjs";
import { projectionPixels } from "./projectionPixels.mjs";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
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
    const engine = new WebGPUEngine(document.getElementById("webgpu_canvas"), { xrCompatible: true, audioEngine: false });
    await engine.initAsync();
    const scene = new Scene(engine);
    // Controller glTF assets and WebXR grip/target-ray poses use the same right-handed basis.
    scene.useRightHandedSystem = true;
    new HemisphericLight("controller light", Vector3.Up(), scene);
    scene.activeCamera = new FreeCamera("viewer", Vector3.Zero(), scene);
    const xr = await WebXRDefaultExperience.CreateAsync(scene, {
        disableDefaultUI: true, disableTeleportation: true,
        inputOptions: { doNotLoadControllerMeshes: true, disableOnlineControllerRepository: true },
    });
    xr.baseExperience.featuresManager.enableFeature("xr-layers", "latest");
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
        const titles = ["Stereo projection", "Viewer-relative projection", "Projection layer replacement",
            ...variants.map(v=>v.entry[0]+(v.foveation === null ? "" : " + foveation")+("moving" in v && v.moving ? " + head sweep" : ""))];
        let status = "";
        const initialPage = Number(native ? globalThis.webxrSamplePage : new URL(location.href).searchParams.get("page"));
        let page = Number.isInteger(initialPage) && initialPage >= 0 && initialPage < titles.length ? initialPage : 0;
        const next = () => { if (!busy) { status = ""; page = (page + 1) % titles.length; } };
        const run = async () => {
            if (busy) return;
            busy = true;
            if (page >= 3) {
                const v = variants[page-3];
                const manager = xr.baseExperience.sessionManager;
                try {
                    let result;
                    if ("single" in v) {
                        engine.stopRenderLoop();
                        try { result = await projectionPixels(manager.session,engine._device,manager.referenceSpace,v.single,v.depth,v.foveation); }
                        finally { engine.runRenderLoop(()=>scene.render()); }
                    } else {
                        result = await exerciseLayer(v.entry,manager.session,engine._device,manager.referenceSpace,
                            native ? "app:///Scripts/layer-images/" : "./layer-images/", v.foveation, v.moving);
                    }
                    status = "Submitted: " + result.frames + " frames";
                    console.info("XR layer submitted",JSON.stringify(result));
                } catch (e) {
                    status = e.message;
                    console.error("XR layer FAIL",titles[page],e.message);
                } finally {
                    busy = false;
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
