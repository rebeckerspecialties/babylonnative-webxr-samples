// Adapt the pinned page's entry/exit controls, not its shaders, scene or score.
const fs = require("node:fs");
const path = require("node:path");
const {createHash} = require("node:crypto");
module.exports = function benchmarkPlugin() {
    const root=process.env.WEBXR_SAMPLES_DIR || path.join(__dirname,"third_party/webxr-samples");
    const file=path.join(root,"webgpu/input-selection-benchmark.html");
    return {name:"immersive-web-selection",setup(build) {
        build.onResolve({filter:/^https?:\/\//},args=>{
            if(args.path!=="https://cdn.jsdelivr.net/npm/@webxr-input-profiles/motion-controllers@1.0/dist/motion-controllers.module.js")
                throw Error("Unpackaged benchmark dependency: "+args.path);
            return {path:"packaged-grip",namespace:"offline"};
        });
        build.onLoad({filter:/.*/,namespace:"offline"},()=>({contents:`export async function fetchProfile(input){
            return {assetPath:(typeof globalThis.runWebXRSample==="function"?"app:///Scripts/":"./")+"controller/"+(input.handedness==="left"?"controller-left.gltf":"controller.gltf")};
        }`}));
        build.onResolve({filter:/^input-selection-page$/},()=>({path:file,namespace:"benchmark"}));
        build.onLoad({filter:/.*/,namespace:"benchmark"},()=>{
            const html=fs.readFileSync(file,"utf8");
            if(createHash("sha256").update(html).digest("hex")!=="f915a5f635befb27c926378409f5c09c376efd51ee62c93bd4108c100bf7468f")
                throw Error("Review host adaptation against the new input-selection-benchmark page");
            const src=html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
            const start=src.indexOf("const DEFAULT_PROFILES_PATH");
            const imports=src.slice(0,start).replace(/^\s*import \{WebXRButton\}.*?;$/m,"")
                .replace(/^\s*import \{ fetchProfile \}.*?;$/m,"");
            const body=src.slice(start,src.lastIndexOf("initXR();"))
                .replace(/document.getElementById\('([^']+)'\)/g,(_,id)=>'controls["'+id+'"]')
                .replace("document.querySelector('header').appendChild(xrButton.domElement);","")
                .replace("const GL = WebGLRenderingContext;","")
                .replaceAll("'../media/gltf/cube-room/cube-room.gltf'","root+'spatial/cube-room/cube-room.gltf'")
                .replaceAll("configureCanvas(canvasFormat);","")
                .replaceAll("createRendererAndScene(canvasFormat);","")
                .replace("startCanvasFrames();","")
                .replace("configureCanvas(colorFormat);","")
                .replace("benchmarkState = null;\n          updateFeatureControls();","benchmarkState = null; reject(err);\n          updateFeatureControls();")
                .replace("function onSessionEnded(event) {","function onSessionEnded(event) { if(event?.type!=='end' || event.session!==active || event.target!==active){reject(Error('Wrong XRSession end event'));return;}")
                .replace(/updateFeatureControls\(\);\s*\}\s*function getHandIndex/,"updateFeatureControls(); resolve(benchmarkStatus.textContent); }\nfunction getHandIndex")
                .replace("xrButton.setSession(session);","active = session; xrButton.setSession(session);");
            return {resolveDir:path.dirname(file),contents:imports+`
import {GL} from "@luma.gl/constants";
export async function runBenchmark(root, warp=false) {
 let active, resolve, reject;
 const ended=new Promise((ok,fail)=>{resolve=ok;reject=fail});
 const controls=Object.fromEntries(["webgpu_status","use_space_warp","use_multiview","do_antialias","use_ripple","shape_count","shape_count_value","benchmark_button","benchmark_status"].map(id=>[id,{checked:["do_antialias","use_ripple"].includes(id),value:9,dataset:{},addEventListener(){}}]));
 controls.use_space_warp.checked=warp;
 const WebXRButton=class {setSession(s){this.session=s}};
 const fetchProfile=async input=>({assetPath:root+"controller/"+(input.handedness==="left"?"controller-left.gltf":"controller.gltf")});
 ${body}
 let deadline;
 try {
   await initXR();
   if (!immersiveVrSupported) throw Error(webgpuStatus.textContent || "Immersive VR unavailable");
   deadline=setTimeout(()=>reject(Error("Selection benchmark exceeded its measurement deadline")),240000);
   startBenchmark();
   return await ended;
 } finally {clearTimeout(deadline); if(active && !active.ended && xrButton?.session) await active.end().catch(()=>{}); device?.destroy();}
}`};
        });
        build.onLoad({filter:/[/\\]js[/\\]render[/\\].*\.js$/},args=>{
            const src=fs.readFileSync(args.path,"utf8");
            if(src.includes("const GL = WebGLRenderingContext;"))
                return {contents:src.replace("const GL = WebGLRenderingContext;",'import {GL} from "@luma.gl/constants";'),resolveDir:path.dirname(args.path)};
        });
    }};
};
