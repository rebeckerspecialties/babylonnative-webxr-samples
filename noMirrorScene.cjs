// Apply the pinned runtime's spectator-safe policy before esbuild minifies the ESM fixture.
const { once, method } = require("./third_party/BabylonNative/Apps/scripts/questMenuLadder/parentBuild.cjs");
module.exports = function withParentClearOptIn(source) {
    if (source.includes("_canSkipParentClear")) throw Error("Review parent-clear support in the new Babylon release");
    const member = "    _clearFrameBuffer(camera) {";
    const invocation = "this._clearFrameBuffer(this.activeCamera);";
    return 'import { Constants } from "./Engines/constants.js";\n' +
        once(once(source, member, "    _canSkipParentClear(camera) " + method + "\n" + member),
            invocation, "if (!this._canSkipParentClear(this.activeCamera)) " + invocation);
};
