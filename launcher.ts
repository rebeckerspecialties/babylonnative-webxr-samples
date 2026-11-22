import { BehaviorSubject } from "rxjs";
import { Modal } from "factotum-ui/Modal";
import { createNodeHandContainer, createUiFollowStack } from "factotum-ui/createUiContainer";
import { OrnamentButton } from "factotum-ui/HandMenu/OrnamentButton";
import { WebGPUEngine } from "@babylonjs/core/Engines/webgpuEngine";
import { Scene } from "@babylonjs/core/scene";
import { FreeCamera } from "@babylonjs/core/Cameras/freeCamera";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
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
    scene.activeCamera = new FreeCamera("viewer", Vector3.Zero(), scene);
    const xr = await WebXRDefaultExperience.CreateAsync(scene, {
        disableDefaultUI: true, disableTeleportation: true,
        inputOptions: { doNotLoadControllerMesh: true },
    });
    xr.baseExperience.featuresManager.enableFeature("xr-layers", "latest");
    const start = async () => {
        await xr.baseExperience.enterXRAsync("immersive-vr", "local", xr.renderTarget, { requiredFeatures: ["webgpu"] });
        engine.runRenderLoop(() => scene.render());
        const stack = createUiFollowStack({});
        const mount = createNodeHandContainer(xr, "left");
        const buttonMesh = CreateBox("sample selector", { size: 0.08 }, scene);
        const material = new StandardMaterial("selector", scene);
        material.emissiveColor = new Color3(0.08, 0.55, 0.85);
        buttonMesh.material = material;
        const backingMesh = CreateBox("selector backing", { size: 0.09, depth: 0.04 }, scene);
        let modal, busy = false;
        const close = () => { modal?.complete(); modal = undefined; };
        const run = async () => {
            if (busy) return;
            busy = true;
            close();
            button.complete();
            await xr.baseExperience.exitXRAsync();
            engine.stopRenderLoop();
            stack.dispose();
            mount.dispose();
            xr.dispose();
            scene.dispose();
            engine.dispose();
            if (native) await globalThis.runWebXRSample();
            else location.assign("webgpu/checks.html");
        };
        const select = () => {
            if (modal || busy) return;
            modal = new BehaviorSubject({
                headerText: "WebXR samples", bodyText: "Barebones WebGPU stereo projection",
                leftButtonText: "Run sample", onLeftButtonClick: () => run().catch(report),
                rightButtonText: "Close", onRightButtonClick: close,
            });
            Modal(stack.node, modal, { nButtons: 2 });
        };
        const button = new BehaviorSubject({
            scene, enabled: true, name: "sample-selector", buttonMesh, backingMesh,
            onClick: select, transformConfig: { position: Vector3.Zero(), scaling: Vector3.One().scale(0.08), rotation: Quaternion.Identity() },
        });
        OrnamentButton(mount, button, {});
        select();
        console.info("XR launcher ready: hand selector and sample modal");
        // Desk qualification drives the very same callbacks as the controls, after rendering.
        if (globalThis.webxrCheckMenuHandoff === true) {
            let count = 0;
            const handle = scene.onAfterRenderObservable.add(() => {
                if (++count !== 120) return;
                scene.onAfterRenderObservable.remove(handle);
                close();
                select();
                modal.value.onLeftButtonClick();
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
