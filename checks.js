// Supplement the upstream renderer. Never substitute another API when WebGPU is unavailable.
const drawUpstreamFrame = onXRFrame;
const drawTriangle = drawScene;
let inputMarkers = null;
drawScene = function (pass, viewIndex = 0) {
    drawTriangle(pass, viewIndex);
    inputMarkers?.draw(pass, gpuBindGroups[viewIndex]);
};
let checkedFrames = 0;
let distinctPoses = false;
let originAligned = false;
onXRFrame = function (time, frame) {
    if (globalThis.webxrSampleAlignOrigin === true && !originAligned) {
        const first = frame.getViewerPose(xrRefSpace);
        if (first) {
            const { position, orientation } = first.transform;
            const copyPoint = p => ({ x: p.x, y: p.y, z: p.z, w: p.w });
            xrRefSpace = xrRefSpace.getOffsetReferenceSpace(new XRRigidTransform(copyPoint(position), copyPoint(orientation)));
            originAligned = true;
        }
    }
    if (globalThis.webxrGuidedInput === true) {
        if (!inputMarkers) {
            inputMarkers = makeInputMarkers(gpuDevice, gpuBindGroupLayout, colorFormat, depthStencilFormat);
            frame.session.addEventListener("end", () => {
                inputMarkers.dispose();
                inputMarkers = null;
            }, { once: true });
        }
        inputMarkers.update(frame, xrRefSpace);
    }
    drawUpstreamFrame(time, frame);
    if (checkedFrames >= 32) return;
    try {
        const pose = frame.getViewerPose(xrRefSpace);
        if (!pose) return;
        const views = pose.views;
        if (checkedFrames === 0) {
            const project = (m, v) => Array.from({length: 4}, (_, i) =>
                m[i] * v[0] + m[i+4] * v[1] + m[i+8] * v[2] + m[i+12] * v[3]);
            console.info("XR sample triangle clip", JSON.stringify(views.map(view =>
                project(view.projectionMatrix, project(view.transform.inverse.matrix, [0,0,-0.5,1])))));
        }
        if (views.length !== 2 || projectionLayer.textureArrayLength !== 2) throw Error("Expected two projection slices");
        const sub = views.map(v => xrGpuBinding.getViewSubImage(projectionLayer, v));
        if (sub[0].colorTexture !== sub[1].colorTexture || sub[0].depthStencilTexture !== sub[1].depthStencilTexture)
            throw Error("Expected shared stereo color and depth arrays");
        for (let i = 0; i < 2; i++) {
            const s = sub[i], d = s.getViewDescriptor();
            if (d.baseArrayLayer !== i || d.arrayLayerCount !== 1 || d.dimension !== "2d" ||
                s.depthStencilTexture.format !== depthStencilFormat || s.colorTexture.format !== colorFormat ||
                s.viewport.width <= 0 || s.viewport.height <= 0)
                throw Error("Invalid subimage for " + views[i].eye);
        }
        distinctPoses ||= views[0].transform.matrix.some((n, i) => Math.abs(n - views[1].transform.matrix[i]) > 1e-5);
        for (const { transform } of views) {
            const inverse = transform.inverse;
            if (inverse !== transform.inverse || inverse.inverse !== transform) throw Error("Inverse identity mismatch");
            for (let i = 0; i < 16; i++) {
                let n = 0;
                for (let k = 0; k < 4; k++) n += inverse.matrix[k * 4 + (i % 4)] * transform.matrix[(i & ~3) + k];
                if (!Number.isFinite(n) || Math.abs(n - (i % 5 === 0 ? 1 : 0)) >= 0.0002)
                    throw Error("Eye inverse did not invert the view transform");
            }
        }
        // A WebGPU session maps the reported near and far planes to 0 and 1.
        const { depthNear, depthFar } = frame.session.renderState;
        for (const { projectionMatrix: p } of views) {
            const clipDepth = z => (p[10] * z + p[14]) / (p[11] * z + p[15]);
            if (!(Math.abs(clipDepth(-depthNear)) < 0.0002 && Math.abs(clipDepth(-depthFar) - 1) < 0.0002))
                throw Error("Eye projection disagrees with XRRenderState.depthNear/depthFar");
        }
        // tests/ref-space-invert.html: moving the reference-space origin to the current viewer
        // must return an identity viewer pose for the same frame. No WebGL base layer is used.
        const offset = xrRefSpace.getOffsetReferenceSpace(pose.transform);
        const local = frame.getViewerPose(offset);
        if (!local || !local.transform.matrix.every((n, i) => Math.abs(n - (i % 5 === 0 ? 1 : 0)) < 0.0002))
            throw Error("Inverse reference space did not give an identity viewer transform");
        if (++checkedFrames === 32) {
            if (!distinctPoses) throw Error("Eye transforms are identical");
            console.info("XR sample PASS: 32 stereo projection frames, depth24plus, inverse reference space");
            if (globalThis.webxrCheckMenuReturn === true) {
                globalThis.webxrCheckMenuReturn = false;
                const session = frame.session;
                setTimeout(() => session.end().catch(e => console.error("XR sample return FAIL", String(e))), 0);
            }
        }
    } catch (e) {
        checkedFrames = 32;
        console.error("XR sample FAIL", String(e), e.stack);
    }
};
