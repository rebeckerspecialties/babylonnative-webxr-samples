// Guided fixtures only. Draw the grip and target ray in the upstream eye pass.
// The unmodified reference page has no input visualization.
function collectTrackedInput(frame, space, matrices) {
    let count = 0;
    for (const source of frame.session.inputSources) {
        if (source.hand || source.targetRayMode !== "tracked-pointer") continue;
        for (const [poseSpace, ray] of [[source.gripSpace, false], [source.targetRaySpace, true]]) {
            if (!poseSpace || count === 4) continue;
            const pose = frame.getPose(poseSpace, space);
            if (!pose) continue;
            const i = count++ * 20;
            matrices.set(pose.transform.matrix, i);
            matrices[i + 16] = ray ? 1 : 0;
            matrices[i + 17] = source.handedness === "left" ? 1 : 0;
        }
    }
    return count;
}

function makeInputMarkers(device, cameraLayout, colorFormat, depthFormat) {
    const shader = device.createShaderModule({code: `
struct Camera { projection: mat4x4f, view: mat4x4f };
struct Marker { world: mat4x4f, flags: vec4f };
@group(0) @binding(0) var<uniform> camera: Camera;
@group(1) @binding(0) var<uniform> markers: array<Marker, 4>;
struct Vertex { @builtin(position) position: vec4f, @location(0) color: vec3f };
@vertex fn vs(@builtin(vertex_index) index: u32, @builtin(instance_index) instance: u32) -> Vertex {
    // Six faces, two triangles per face; dimensions are in metres in grip/ray space.
    let corners = array<vec3f,8>(vec3f(-1,-1,-1), vec3f(1,-1,-1), vec3f(1,1,-1), vec3f(-1,1,-1),
                                vec3f(-1,-1,1), vec3f(1,-1,1), vec3f(1,1,1), vec3f(-1,1,1));
    let indices = array<u32,36>(0,1,2,0,2,3, 4,6,5,4,7,6, 0,4,5,0,5,1, 3,2,6,3,6,7, 0,3,7,0,7,4, 1,5,6,1,6,2);
    let marker = markers[instance];
    let ray = marker.flags.x > 0.5;
    let size = select(vec3f(0.026,0.028,0.060), vec3f(0.002,0.002,0.30), ray);
    let p = corners[indices[index]] * size + vec3f(0,0,select(0.0,-0.30,ray));
    let color = select(vec3f(1,0.61,0.15), vec3f(0.18,0.74,1), marker.flags.y > 0.5);
    return Vertex(camera.projection * camera.view * marker.world * vec4f(p,1),
                  color * select(0.65 + 0.06 * f32(index / 6u), 1.0, ray));
}
@fragment fn fs(v: Vertex) -> @location(0) vec4f { return vec4f(v.color, 1); }
`});
    const data = new Float32Array(4 * 20);
    const buffer = device.createBuffer({size: data.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST});
    const layout = device.createBindGroupLayout({entries: [{binding: 0, visibility: GPUShaderStage.VERTEX, buffer: {type: "uniform"}}]});
    const group = device.createBindGroup({layout, entries: [{binding: 0, resource: {buffer}}]});
    const pipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({bindGroupLayouts: [cameraLayout, layout]}),
        vertex: {module: shader, entryPoint: "vs"},
        fragment: {module: shader, entryPoint: "fs", targets: [{format: colorFormat}]},
        depthStencil: {format: depthFormat, depthWriteEnabled: true, depthCompare: "less"},
    });
    let count = 0;
    return {
        update(frame, space) {
            count = collectTrackedInput(frame, space, data);
            if (count) device.queue.writeBuffer(buffer, 0, data, 0, count * 20);
        },
        draw(pass, camera) {
            if (!count) return;
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, camera);
            pass.setBindGroup(1, group);
            pass.draw(36, count);
        },
        dispose() { buffer.destroy(); },
    };
}
