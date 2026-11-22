const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");
const output = path.join(__dirname, "build/launcher");
fs.mkdirSync(output, {recursive: true});
esbuild.build({
    entryPoints: [path.join(__dirname, "launcher.ts")],
    outfile: path.join(output, "launcher.js"),
    alias: { "sample-menu": path.join(__dirname, "publicMenu.ts") },
    bundle: true, format: "iife", platform: "browser", target: "chrome112", minify: true,
    plugins: [{name: "guard-video-prewarm", setup(build) {
        build.onLoad({filter: /\/Engines\/WebGPU\/webgpuTextureManager\.js$/}, args => {
            const source = fs.readFileSync(args.path, "utf8");
            const prewarm = /^(\s*)this\._getVideoPipeline\("rgba8unorm"[^\n]*\);$/gm;
            if (Array.from(source.matchAll(prewarm)).length !== 1) throw Error("Recheck external-texture prewarm against the pinned engine");
            return {contents: source.replace(prewarm, line => 'if (typeof this._device.importExternalTexture === "function") {' + line + '}'), resolveDir: path.dirname(args.path)};
        });
    }}],
}).then(() => fs.copyFileSync(path.join(__dirname, "launcher.html"), path.join(output, "launcher.html"))).catch(error => {
    console.error(error);
    process.exitCode = 1;
});
