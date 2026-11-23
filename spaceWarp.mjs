import { bounded } from "./composition.mjs";

export async function warpFrames(session, device, space, mediaKind) {
    const binding = new XRGPUBinding(session, device);
    const original = Array.from(session.renderState.layers);
    const layer = binding.createProjectionLayer({colorFormat: binding.getPreferredColorFormat(), depthStencilFormat: "depth32float"});
    if (!session.enabledFeatures.includes("space-warp") || !binding.usesDepthValues || layer.ignoreDepthValues)
        throw Error("Required compositor motion/depth path was not enabled");
    let size, video, media;
    device.pushErrorScope("validation");
    try {
        if (mediaKind) {
            layer.fixedFoveation = 1;
            if (layer.fixedFoveation !== 1) throw Error("Combined test requires fixed foveation");
            video = document.createElement("video");
            video.muted = true; video.loop = true; video.playsInline = true;
            video.src = "app:///Scripts/layer-images/bbb-sunflower-540p2-1min.webm";
            await bounded(video.play(), 15000, "Combined media did not start");
            const options = {space, layout: "stereo-top-bottom", transform: new XRRigidTransform({z:-2})};
            if (mediaKind === "Quad") Object.assign(options, {width:2,height:1});
            if (mediaKind === "Cylinder") Object.assign(options, {radius:2,centralAngle:1,aspectRatio:2});
            media = new XRMediaBinding(session)["create"+mediaKind+"Layer"](video, options);
        }
        session.updateRenderState({layers: media ? [layer,media] : [layer]});
        // Incomplete first frame, complete stereo frame, then a frame without
        // motion. No state from the complete frame may leak into its successor.
        const start = performance.now(), initialTime = video?.currentTime;
        let step=0;
        while (step<3 || (media && performance.now()-start < 4000)) {
            await bounded(new Promise((ok, fail) => session.requestAnimationFrame(function frame(_, fr) {
                try {
                    const pose = fr.getViewerPose(space);
                    if (!pose) { session.requestAnimationFrame(frame); return; }
                    if (pose.views.length !== 2) throw Error("Expected two projection views");
                    if (media && session.renderState.layers[1] !== media) throw Error("Media not active alongside warp projection");
                    const encoder = device.createCommandEncoder();
                    let first;
                    for (const [i, view] of pose.views.entries()) {
                        const sub = binding.getViewSubImage(layer, view);
                        const d = sub.getViewDescriptor();
                        const {colorTexture: color, motionVectorTexture: motion, depthStencilTexture: depth} = sub;
                        if (d.baseArrayLayer !== i || !depth || !motion || motion === color ||
                            motion.format !== "rgba16float" || depth.format !== "depth32float" ||
                            motion.width !== depth.width || motion.height !== depth.height ||
                            motion.depthOrArrayLayers !== 2 || depth.depthOrArrayLayers !== 2 ||
                            (first && (first.motionVectorTexture !== motion || first.depthStencilTexture !== depth)))
                            throw Error("Incorrect per-eye motion/depth attachments");
                        first = sub;
                        size = [color.width, color.height, motion.width, motion.height];
                        encoder.beginRenderPass({colorAttachments: [{view: color.createView(d),
                            clearValue: [0.04, 0.16, 0.2, 1], loadOp: "clear", storeOp: "store"}]}).end();
                        if (step === 1 || step > 2 || (step === 0 && i === 0))
                            encoder.beginRenderPass({colorAttachments: [{view: motion.createView(d),
                                clearValue: [0, 0, 0, 0], loadOp: "clear", storeOp: "store"}],
                                depthStencilAttachment: {view: depth.createView(d), depthClearValue: 1,
                                    depthLoadOp: "clear", depthStoreOp: "store"}}).end();
                    }
                    layer.deltaPose = new XRRigidTransform();
                    device.queue.submit([encoder.finish()]);
                    ok();
                } catch (e) { fail(e); }
            })), 8000, "No tracked space-warp frame");
            step++;
        }
        if (video && !(video.currentTime-initialTime > 2)) throw Error("Media failed to advance alongside warp");
        return {frames:step, colorAndMotionExtent:size, mediaKind, mediaSeconds:video?.currentTime};
    } finally {
        session.updateRenderState({layers: original});
        await bounded(new Promise(ok => session.requestAnimationFrame(ok)), 5000, "Warp projection did not retire");
        media?.destroy();
        if (video) {video.pause(); video.removeAttribute("src"); video.load();}
        const error = await device.popErrorScope();
        if (error) throw Error(error.message);
    }
}
