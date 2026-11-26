import { RegisterWebXRMotionControllerManager } from "@babylonjs/core/XR/motionController/webXRMotionControllerManager.pure.js";
import { RegisterWebXROculusTouchMotionController } from "@babylonjs/core/XR/motionController/webXROculusTouchMotionController.pure.js";

export function registerLauncherInputProfiles() {
    RegisterWebXRMotionControllerManager();
    RegisterWebXROculusTouchMotionController();
}
