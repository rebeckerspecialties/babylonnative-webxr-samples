import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import "@babylonjs/core/Materials/standardMaterial";
import { AdvancedDynamicTexture, Button, StackPanel, TextBlock } from "@babylonjs/gui/2D";
import { bindMenuInput, menuAnchor, menuHit } from "./menuRay.mjs";

export function showMenu(scene, xr, current, run, next) {
    const panel = CreatePlane("WebXR samples", {width: 0.85, height: 0.52, sideOrientation: 2}, scene);
    const manager = xr.baseExperience.sessionManager;
    let anchor = null;
    let visible = true;
    const recenter = () => { anchor = null; panel.setEnabled(false); };
    panel.setEnabled(false);
    const poseObserver = manager.onXRFrameObservable.add(frame => {
        if (anchor) return;
        const pose = frame.getViewerPose(manager.referenceSpace);
        if (!pose || pose.emulatedPosition) return;
        anchor = menuAnchor(pose.transform.matrix);
        if (!anchor) return;
        panel.position.set(anchor.x, anchor.y, anchor.z);
        panel.rotation.y = Math.atan2(anchor.nx, anchor.nz);
        panel.setEnabled(visible);
    });
    const texture = AdvancedDynamicTexture.CreateForMesh(panel, 1024, 624);
    texture.background = "#182632";
    const controls = new StackPanel();
    texture.addControl(controls);
    const title = new TextBlock("current test", current());
    title.height = "175px"; title.fontSize = 44; title.color = "white";
    controls.addControl(title);
    const buttons = [];
    for (const [label, action] of [["Run", run], ["Next", () => { next(); title.text = current(); }]] as const) {
        const b = Button.CreateSimpleButton(label, label);
        b.color = "white"; b.background = "#185975"; b.width = "60%"; b.height = "115px"; b.fontSize = 44;
        buttons.push({ b, action }); controls.addControl(b);
    }
    const select = event => {
        if (!visible) return;
        const pose = event.frame.getPose(event.inputSource.targetRaySpace, manager.referenceSpace);
        const hit = menuHit(anchor, pose?.transform.matrix, 0.85, 0.52);
        if (!hit) return;
        const size = texture.getSize();
        const button = buttons.find(({ b }) => b.contains(hit[0] * size.width, hit[1] * size.height));
        if (button) {
            console.info("XR selector select", event.inputSource.handedness, button.b.name);
            Promise.resolve().then(button.action);
        }
    };
    const unbind = bindMenuInput(manager,select,recenter);
    return { setVisible: value => { visible=value; panel.setEnabled(visible && !!anchor); },
        refresh: () => { title.text = current(); }, dispose: () => {
        manager.onXRFrameObservable.remove(poseObserver);
        unbind();
        texture.dispose();
        panel.dispose();
    } };
}
