import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Ray } from "@babylonjs/core/Culling/ray";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { Button } from "@babylonjs/gui/2D/controls/button";
import { StackPanel } from "@babylonjs/gui/2D/controls/stackPanel";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
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
    let transitions = 0;
    const tint = new StandardMaterial("Menu hover tint", scene);
    tint.disableLighting = true;
    tint.emissiveColor = Color3.FromHexString(texture.background);
    tint.alpha = 0.1;
    for (const [label, action] of [["Run", run], ["Next", () => { next(); title.text = current(); }]] as const) {
        const b = Button.CreateSimpleButton(label, label);
        b.color = "white"; b.background = "#185975"; b.width = "60%"; b.height = "115px"; b.fontSize = 44;
        const overlay = CreatePlane(label + " hover", {size: 1, sideOrientation: 2}, scene);
        overlay.parent = panel;
        overlay.isPickable = false;
        overlay.material = tint;
        overlay.setEnabled(false);
        const enter = b.pointerEnterAnimation, leave = b.pointerOutAnimation;
        const hover = () => {
            const m = b._currentMeasure, s = texture.getSize();
            overlay.scaling.set(0.85 * m.width / s.width, 0.52 * m.height / s.height, 1);
            overlay.position.set(0.85 * ((m.left + m.width / 2) / s.width - 0.5),
                0.52 * (0.5 - (m.top + m.height / 2) / s.height), 0.001);
            overlay.setEnabled(true);
        };
        function useOverlay(enabled) {
            leave();
            overlay.setEnabled(false);
            const onEnter = enabled ? hover : enter;
            b.pointerEnterAnimation = globalThis.webxrHoverSweep === true ? () => { ++transitions; onEnter(); } : onEnter;
            b.pointerOutAnimation = enabled ? () => overlay.setEnabled(false) : leave;
        }
        useOverlay(true);
        buttons.push({ b, action, useOverlay }); controls.addControl(b);
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
    // Qualification only: replay the same moving ray through scene picking and GUI input.
    let sweep;
    if (globalThis.webxrHoverSweep === true) {
        let stage = -1, start = 0, last = 0, frames = 0, misses = 0, paints = 0, hits = 0;
        const repaint = texture.onEndRenderObservable.add(() => ++paints);
        sweep = manager.onXRFrameObservable.add(() => {
            if (!anchor || !buttons[0].b._currentMeasure.width) return;
            const now = manager.currentTimestamp;
            if (stage === -1 || now - start >= 23000) {
                if (stage >= 0) console.info("XR launcher hover sweep", JSON.stringify({stage, frames, misses, paints, hits, transitions, elapsed:now-start}));
                if (++stage === 3) {
                    manager.onXRFrameObservable.remove(sweep);
                    texture.onEndRenderObservable.remove(repaint);
                    buttons.forEach(({useOverlay})=>useOverlay(true));
                    return;
                }
                buttons.forEach(({useOverlay})=>useOverlay(stage === 1));
                start = last = now; frames = misses = paints = hits = transitions = 0;
            }
            if (now - start > 2000) {
                frames++;
                misses += Math.max(0, Math.round((now - last)*manager.session.frameRate/1000)-1);
            }
            last = now;
            const origin = new Vector3(anchor.x + anchor.nx, anchor.y, anchor.z + anchor.nz);
            const y = -0.055 + 0.16*Math.sin((now-start)*0.024);
            const ray = new Ray(origin, new Vector3(-anchor.nx,y,-anchor.nz).normalize());
            const pick = scene.pickWithRay(ray, m=>m===panel);
            if (pick?.hit) {hits++; scene.simulatePointerMove(pick,{pointerId:9876,pointerType:"xr"});}
        });
    }
    return { isPlaced: () => !!anchor && panel.isEnabled() && buttons[0].b._currentMeasure.width > 0,
        setVisible: value => { visible=value; panel.setEnabled(visible && !!anchor); },
        refresh: () => { title.text = current(); }, dispose: () => {
        manager.onXRFrameObservable.remove(poseObserver);
        if (sweep) manager.onXRFrameObservable.remove(sweep);
        unbind();
        texture.dispose();
        panel.dispose();
        tint.dispose();
    } };
}
