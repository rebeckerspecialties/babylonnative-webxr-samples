import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import "@babylonjs/core/Materials/standardMaterial";
import { AdvancedDynamicTexture, Button, StackPanel, TextBlock } from "@babylonjs/gui/2D";

export function showMenu(scene, xr, current, run, next) {
    const panel = CreatePlane("WebXR samples", {width: 0.85, height: 0.52, sideOrientation: 2}, scene);
    const camera = xr.baseExperience.camera;
    // Leave the panel in the world at its initial viewing direction so the user can point at it.
    const positionPanel = () => {
        const ray = camera.getForwardRay(1.25);
        panel.position.copyFrom(ray.origin.add(ray.direction.scale(1.25)));
        panel.rotationQuaternion = camera.absoluteRotation.clone();
        panel.setEnabled(true);
    };
    const manager = xr.baseExperience.sessionManager;
    panel.setEnabled(false);
    const poseObserver = manager.onXRFrameObservable.add(frame => {
        if (frame.getViewerPose(manager.referenceSpace)) {
            positionPanel();
            manager.onXRFrameObservable.remove(poseObserver);
        }
    });
    manager.session.addEventListener("squeeze", positionPanel);
    const texture = AdvancedDynamicTexture.CreateForMesh(panel, 1024, 624);
    texture.background = "#182632";
    const controls = new StackPanel();
    texture.addControl(controls);
    const title = new TextBlock("current test", current());
    title.height = "175px"; title.fontSize = 44; title.color = "white";
    controls.addControl(title);
    for (const [label, action] of [["Run", run], ["Next", () => { next(); title.text = current(); }]] as const) {
        const b = Button.CreateSimpleButton(label, label);
        b.color = "white"; b.background = "#185975"; b.width = "60%"; b.height = "115px"; b.fontSize = 44;
        b.onPointerClickObservable.add(action); controls.addControl(b);
    }
    return { dispose: () => {
        manager.onXRFrameObservable.remove(poseObserver);
        manager.session.removeEventListener("squeeze", positionPanel);
        texture.dispose();
        panel.dispose();
    } };
}
