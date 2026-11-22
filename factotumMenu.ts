import { BehaviorSubject } from "rxjs";
import { Modal } from "factotum-ui/Modal";
import { createNodeHandContainer, createUiFollowStack } from "factotum-ui/createUiContainer";
import { OrnamentButton } from "factotum-ui/HandMenu/OrnamentButton";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";

export function showMenu(scene, xr, current, run, next) {
    const stack = createUiFollowStack({});
    const mount = createNodeHandContainer(xr, "left");
    const buttonMesh = CreateBox("sample selector", { size: 0.08 }, scene);
    const material = new StandardMaterial("selector", scene);
    material.emissiveColor = new Color3(0.08, 0.55, 0.85);
    buttonMesh.material = material;
    const backingMesh = CreateBox("selector backing", { size: 0.09, depth: 0.04 }, scene);
    let modal;
    const show = () => {
        modal?.complete();
        modal = new BehaviorSubject({
            headerText: current(), bodyText: "Trigger in sample: return to menu",
            leftButtonText: "Run", onLeftButtonClick: run,
            rightButtonText: "Next", onRightButtonClick: () => { next(); show(); },
        });
        Modal(stack.node, modal, { nButtons: 2 });
    };
    const button = new BehaviorSubject({
        scene, enabled: true, name: "sample-selector", buttonMesh, backingMesh, onClick: show,
        transformConfig: { position: Vector3.Zero(), scaling: Vector3.One().scale(0.08), rotation: Quaternion.Identity() },
    });
    OrnamentButton(mount, button, {});
    show();
    return { dispose: () => { modal.complete(); button.complete(); stack.dispose(); mount.dispose(); } };
}
