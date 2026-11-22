// Consume the shared UI at build time, never package the visualization app or its archives.
const path = require("node:path");
const fs = require("node:fs");
const [workspace, modules, output] = process.argv.slice(2).map(p => path.resolve(p));
if (!output) throw Error("Usage: node buildLauncher.cjs FACTOTUM_WORKSPACE BABYLON_NODE_MODULES OUTPUT_DIRECTORY");
const esbuild = require(require.resolve("esbuild", { paths: [workspace] }));
const ui = path.join(workspace, "apps/visualization/src/app/components/babylonUi");
fs.mkdirSync(output, { recursive: true });
esbuild.build({
    entryPoints: [path.join(__dirname, "launcher.ts")], outfile: path.join(output, "launcher.js"),
    bundle: true, format: "iife", platform: "browser", target: "chrome112", minify: true,
    tsconfig: path.join(workspace, "tsconfig.base.json"), nodePaths: [path.join(workspace, "node_modules")],
    alias: { "factotum-ui": ui, "@babylonjs/core": path.join(modules, "@babylonjs/core"), "@babylonjs/gui": path.join(modules, "@babylonjs/gui") },
}).then(() => fs.copyFileSync(path.join(__dirname, "launcher.html"), path.join(output, "launcher.html"))).catch(() => process.exitCode = 1);
