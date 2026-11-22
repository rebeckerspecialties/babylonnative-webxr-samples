// Consume the shared UI at build time, never package the visualization app or its archives.
const path = require("node:path");
const fs = require("node:fs");
const publicMenu = process.argv[2] === "--public";
const workspace = publicMenu ? __dirname : path.resolve(process.argv[2]);
const modules = path.resolve(process.argv[3]);
const output = path.resolve(process.argv[4]);
if (!output) throw Error("Usage: node buildLauncher.cjs FACTOTUM_WORKSPACE BABYLON_NODE_MODULES OUTPUT_DIRECTORY");
const esbuild = require(require.resolve("esbuild", { paths: [workspace] }));
const ui = path.join(workspace, "apps/visualization/src/app/components/babylonUi");
fs.mkdirSync(output, { recursive: true });
esbuild.build({
    entryPoints: [path.join(__dirname, "launcher.ts")], outfile: path.join(output, "launcher.js"),
    bundle: true, format: "iife", platform: "browser", target: "chrome112", minify: true,
    plugins: [{ name: "guard-video-prewarm", setup(build) {
        build.onLoad({ filter: /\/Engines\/WebGPU\/webgpuTextureManager\.js$/ }, args => {
            const src = fs.readFileSync(args.path, "utf8");
            const eager = /^(\s*)this\._getVideoPipeline\("rgba8unorm"[^\n]*\);$/gm;
            if (Array.from(src.matchAll(eager)).length !== 1) throw Error("Check the external texture prewarm against the pinned Babylon release");
            return { contents: src.replace(eager, line => 'if (typeof this._device.importExternalTexture === "function") {' + line + '}'), resolveDir: path.dirname(args.path) };
        });
    } }],
    ...(publicMenu ? {} : { tsconfig: path.join(workspace, "tsconfig.base.json") }), nodePaths: [path.join(workspace, "node_modules")],
    alias: { "sample-menu": path.join(__dirname, publicMenu ? "publicMenu.ts" : "factotumMenu.ts"), "factotum-ui": ui, "@babylonjs/core": path.join(modules, "@babylonjs/core"), "@babylonjs/gui": path.join(modules, "@babylonjs/gui"), "@babylonjs/loaders": path.join(modules, "@babylonjs/loaders") },
}).then(() => fs.copyFileSync(path.join(__dirname, "launcher.html"), path.join(output, "launcher.html"))).catch(() => process.exitCode = 1);
