import { ImportMeshAsync } from "@babylonjs/core/Loading/sceneLoader";
import { Matrix, Quaternion } from "@babylonjs/core/Maths/math.vector";
import { Color4 } from "@babylonjs/core/Maths/math.color";
import { bounded } from "./composition.mjs";

export const spatialCases = [
    { title:"Hit tests", hit:true },
    { title:"Anchors", anchors:true },
    { title:"Hit tests + anchors", hit:true, anchors:true },
    { title:"Plane detection with anchors", planes:true, anchors:true },
];

// Adapt the upstream reticle/flower scenarios to the existing WebGPU renderer.
// Never replace missing real-world geometry with a synthetic floor.
export async function spatialSample(kind,scene,xr,assetRoot) {
    const features=["webgpu","layers",...(kind.hit?["hit-test"]:[]),...(kind.anchors?["anchors"]:[]),...(kind.planes?["plane-detection"]:[])];
    const mode=kind.hit||kind.planes?"immersive-ar":"immersive-vr";
    if (!(await navigator.xr.isSessionSupported(mode))) throw Error(mode+" unavailable");
    let session,source,select,anchor,handle,ended=false;
    const meshes=[];
    const oldClear=scene.clearColor;
    const place=(root,pose)=>{
        if(!pose) {root.setEnabled(false);return;}
        root.rotationQuaternion??=Quaternion.Identity();
        Matrix.FromArray(pose.transform.matrix).decompose(undefined,root.rotationQuaternion,root.position);
        root.setEnabled(true);
    };
    try {
        const load=async name=>{
            const group=await ImportMeshAsync(assetRoot+name+"/"+name+".gltf",scene);
            meshes.push(...group.meshes);
            const root=group.meshes[0];root.setEnabled(false);return root;
        };
        const reticle=await load("reticle"),flower=await load("sunflower");
        if(mode==="immersive-ar") scene.clearColor=new Color4(0,0,0,0);
        await xr.baseExperience.enterXRAsync(mode,"local",xr.renderTarget,{requiredFeatures:features});
        const manager=xr.baseExperience.sessionManager;
        session=manager.session;
        const local=manager.referenceSpace, viewer=await session.requestReferenceSpace("viewer");
        if(kind.hit) source=await session.requestHitTestSource({space:viewer}); // Deliberately omit offsetRay.
        if(kind.planes && !session.enabledFeatures?.includes("plane-detection")) throw Error("Plane detection was not granted");
        let settled,fail,tracked=0,placements=0,busy=false;
        const proof=new Promise((res,rej)=>{settled=res;fail=rej;});
        const candidate=frame=>{
            if(source) return frame.getHitTestResults(source)[0];
            if(kind.planes) return Array.from(frame.detectedPlanes || []).find(p=>p.polygon.length>=3);
            return null;
        };
        select=async event=>{
            if(ended||busy)return;
            busy=true;
            try {
                const frame=event.frame, target=candidate(frame);
                if ((source||kind.planes)&&!target) return;
                const pose=source?target.getPose(local):frame.getPose(target?.planeSpace??event.inputSource.targetRaySpace,local);
                if(!pose) return;
                if (kind.anchors) {
                    let next;
                    if(source) next=await target.createAnchor();
                    else next=await frame.createAnchor(new XRRigidTransform({z:target?0:-1}),target?.planeSpace??event.inputSource.targetRaySpace);
                    if(ended) {next.delete();return;}
                    anchor?.delete();anchor=next;
                } else place(flower,pose);
                placements++;
            } catch(e){fail(e);} finally {busy=false;}
        };
        session.addEventListener("select",select);
        handle=manager.onXRFrameObservable.add(frame=>{
            try {
                const item=candidate(frame);
                const pose=source?item?.getPose(local):item?frame.getPose(item.planeSpace,local):null;
                place(reticle,pose);
                if(anchor) place(flower,frame.getPose(anchor.anchorSpace,local));
                if(placements&&flower.isEnabled()&&++tracked>=72) settled();
            } catch(e){fail(e);}
        });
        await bounded(proof,90000,"No tracked placement and 72 visible frames");
        return {frames:tracked,title:kind.title,placements};
    } finally {
        ended=true;
        if(handle) xr.baseExperience.sessionManager.onXRFrameObservable.remove(handle);
        if(select) session?.removeEventListener("select",select);
        source?.cancel();anchor?.delete();
        if(session) await xr.baseExperience.exitXRAsync();
        for(const m of meshes.reverse()) m.dispose(false,true);
        scene.clearColor=oldClear;
    }
}
