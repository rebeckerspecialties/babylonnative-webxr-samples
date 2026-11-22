import { showMenu } from "sample-menu";
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
    new HemisphericLight("controller light", Vector3.Up(), scene);
    scene.activeCamera = new FreeCamera("viewer", Vector3.Zero(), scene);
    const xr = await WebXRDefaultExperience.CreateAsync(scene, {
        disableDefaultUI: true, disableTeleportation: true,
        inputOptions: { doNotLoadControllerMeshes: true, disableOnlineControllerRepository: true },
    });
    xr.baseExperience.featuresManager.enableFeature("xr-layers", "latest");
    async function attachController(controller) {
        const source = controller.inputSource;
        if (!controller.grip || source.hand || source.targetRayMode !== "tracked-pointer") return;
        const name = source.handedness === "left" ? "controller-left.gltf" : "controller.gltf";
        const result = await ImportMeshAsync((native ? "app:///Scripts/controller/" : "./controller/") + name, scene, { meshNames: "mesh340565441" });
        if (scene.isDisposed || controller.grip.isDisposed()) {
            for (const mesh of result.meshes) mesh.dispose();
            return;
        }
        for (const mesh of result.meshes) {
            if (!mesh.parent) mesh.parent = controller.grip;
            mesh.isPickable = false;
        }
        if (!result.meshes.some(mesh => mesh.getTotalVertices() > 0)) throw Error("No controller geometry for " + source.handedness);
        console.info("XR selector grip model", source.handedness, result.meshes.length);
    }
    xr.input.onControllerAddedObservable.add(c => attachController(c).catch(report));
    for (const c of xr.input.controllers) attachController(c).catch(report);
    const start = async () => {
        await xr.baseExperience.enterXRAsync("immersive-vr", "local", xr.renderTarget, { requiredFeatures: ["webgpu"] });
        engine.runRenderLoop(() => scene.render());
        let busy = false;
        const titles = ["Stereo projection", "Viewer-relative projection"];
        let page = native ? (globalThis.webxrSamplePage || 0) : Number(new URL(location.href).searchParams.get("page") === "1");
        const next = () => { page = (page + 1) % titles.length; };
        const run = async () => {
            if (busy) return;
            busy = true;
            menu.dispose();
            await xr.baseExperience.exitXRAsync();
            engine.stopRenderLoop();
            xr.dispose();
            scene.dispose();
            engine.dispose();
            if (native) {
                globalThis.webxrSampleAlignOrigin = page === 1;
                globalThis.webxrSamplePage = (page + 1) % titles.length;
                await globalThis.runWebXRSample(() => prepareLauncher().catch(report));
            }
            else location.assign("webgpu/checks.html?launcher=1&page=" + page);
        };
        const menu = showMenu(scene, xr, () => (page + 1) + " / " + titles.length + "   " + titles[page], () => run().catch(report), next);
        console.info("XR launcher ready", titles[page]);
        // Desk qualification drives the very same callbacks as the controls, after rendering.
        if (globalThis.webxrCheckMenuHandoff === true) {
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
