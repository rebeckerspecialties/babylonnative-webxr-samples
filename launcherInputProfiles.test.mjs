import assert from "node:assert/strict";
import test from "node:test";
import { WebXRMotionControllerManager as Manager } from "@babylonjs/core/XR/motionController/webXRMotionControllerManager.pure.js";
import { registerLauncherInputProfiles } from "./launcherInputProfiles.mjs";

test("offline launcher resolves Touch v2 components without loading a model", async () => {
    const online = Manager.UseOnlineRepository;
    Manager.UseOnlineRepository = false;
    try {
        registerLauncherInputProfiles();
        for (const handedness of ["left", "right"]) {
            const buttons = Array.from({ length: 6 }, () => ({ pressed: false, touched: false, value: 0 }));
            const gamepad = { id: "", buttons, axes: [0, 0, 0, 0] };
            const controller = await Manager.GetMotionControllerWithXRInput({
                gamepad, handedness, profiles: ["oculus-touch-v2", "generic-trigger-squeeze-touchpad-thumbstick"]
            }, {});
            assert.equal(controller.profileId, "oculus-touch");
            const trigger = controller.getMainComponent();
            assert.equal(trigger.id, "xr-standard-trigger");
            const squeeze = controller.getComponent("xr-standard-squeeze");
            buttons[1] = { pressed: true, touched: true, value: 1 };
            controller.updateFromXRFrame({});
            assert.equal(squeeze.pressed, true);
            assert.equal(trigger.pressed, false);
            buttons[0] = buttons[1];
            controller.updateFromXRFrame({});
            assert.equal(trigger.pressed, true);
            assert.ok(!controller.rootMesh);
            controller.dispose();
        }
        await assert.rejects(Manager.GetMotionControllerWithXRInput({
            handedness: "none", profiles: ["unknown-profile"], gamepad: { id: "" }
        }, {}), /no controller requested/);
    } finally {
        Manager.UseOnlineRepository = online;
    }
});
