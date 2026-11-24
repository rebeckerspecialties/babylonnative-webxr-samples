import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { AdvancedDynamicTexture, TextBlock } from "@babylonjs/gui/2D";
import { XRFrameRate } from "./frameRate.mjs";

export function attachFrameRateHud(scene, xr) {
    const manager = xr.baseExperience.sessionManager;
    const plane = CreatePlane("XR frame rate", {width:0.19,height:0.06,sideOrientation:2}, scene);
    plane.parent = xr.baseExperience.camera;
    plane.position.set(-0.28,0.22,scene.useRightHandedSystem ? -0.85 : 0.85);
    plane.isPickable = false;
    const texture = AdvancedDynamicTexture.CreateForMesh(plane,256,80);
    texture.background = "#17232a";
    const label = new TextBlock("frame rate","-- FPS");
    label.color = "white"; label.fontSize = 37;
    texture.addControl(label);
    const rate = new XRFrameRate();
    const reset = () => { rate.reset(); label.text = "-- FPS"; };
    const frame = manager.onXRFrameObservable.add(() => {
        if (manager.session.visibilityState === "hidden") { reset(); return; }
        const fps = rate.sample(manager.currentTimestamp);
        if (fps !== undefined) label.text = fps.toFixed(1) + " FPS";
    });
    const end = manager.onXRSessionEnded.add(reset);
    scene.onDisposeObservable.addOnce(() => {
        manager.onXRFrameObservable.remove(frame);
        manager.onXRSessionEnded.remove(end);
        texture.dispose();
    });
}
