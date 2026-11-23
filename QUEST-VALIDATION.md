# Quest 1 Vulkan qualification

Standalone samples, Android 10, 72 Hz. Ordinary application logging, without
a Vulkan interception layer. The application and display figures describe
different things: callback counts alone do not establish binocular alignment.

| Fixture | Device result |
| --- | --- |
| Quad, cylinder, equirect and cube images, ordered layers, destruction | OpenXR accepted the native layers. Observed about 557–576 callbacks in 8 s. Source textures are packaged in the APK. |
| Direct media quad, cylinder, equirect | Android decoder rendered to OpenXR-owned surfaces. 566–572 callbacks and 7.80–7.97 s media advancement in 8 s. |
| Video on a WebGPU texture | Two independent eye snapshots: 21–22 callbacks in 8 s. One packed stereo snapshot: 42 callbacks in 8 s (7.94 s media advance); direct media measured 566 in the same run. CPU frame extraction remains unsuitable for real-time video. |
| Two-pass and single-pass stereo, each with and without depth | All four passed distinct per-eye foreground and silhouette readbacks at a world-space target. Probed the center and both sides of each projected edge; near geometry won the depth test. IPD in head coordinates was 66.36 mm with left/right in the correct order. Observed 286–287 callbacks in 4 s. |
| Selection benchmark | Original MSAA and ripple enabled; fewer than two shapes sustained the required 68.4 fps. |
| Projection fixed foveation | Fails: projection returns null. Runtime advertises XR_FB_foveation_vulkan; the Vulkan driver advertises VK_EXT_fragment_density_map. Neither means the application's eye pass uses a density attachment. |
| Application space warp | Required feature rejects before session creation. The Quest runtime recommends a 304×336 motion image (1216×1344 projection) and lists RGBA16F, D16, D24S8 and D32F swapchain formats. Motion and corresponding depth are not yet submitted for synthesis. The older half-rate score was invalid: the sample returned early on a null motion-vector texture. |
| Timewarp | VrApi reported TW=2.85 ms and 72/72 fps in a direct-media quad run. A physical head sweep and optical inspection remain outstanding. |
| Hit test, anchors, hit + anchors, planes + anchors | Included with local assets. Need a tracked AR runtime with the corresponding grants. Quest 1's opaque OpenXR backend cannot qualify AR. |

The unmodified [CI APK at 3e9719c](https://github.com/rebeckerspecialties/babylonnative-webxr-samples/actions/runs/45160177937)
passed the 14 default Android layer checks on the Quest. To run the suite on another headset:
`python3 android/test-layers.py SERIAL`. For just the projection silhouettes, use
`python3 android/test-layers.py SERIAL 25 26 27 28`; the reported eye separation comes
from the headset, not a hard-coded 66 mm camera. Those readbacks precede lens distortion.

Adreno system-wide counters during the ordinary upstream selection workload,
without driver tracing: 72.45–73.88% of shading time in fragments,
40.31–41.90% ALU capacity utilized, 4.09–5.13% stalled on system memory.
These readings include the compositor. They do not isolate Factotum playback
or give a GMEM spill count. During the simpler image-layer sequence the CPU
PMU (app PID, three separate 250 ms groups) reported 66,850,416 cycles /
27,107,580 instructions; 367,370 misses / 17,015,446 L1 data loads;
289,203 branch misses / 5,456,117 branch predictions.

Relevant independent implementation checks: WebKit fixed omitted offset rays
([4671d8f9fb](https://github.com/WebKit/WebKit/commit/4671d8f9fb)),
nonfixed reference spaces ([75e1aa4896](https://github.com/WebKit/WebKit/commit/75e1aa4896)),
and hit testing in the requested space ([adad6bed1f](https://github.com/WebKit/WebKit/commit/adad6bed1f)).
The NativeXR regression distinguishes an offset viewer from an offset local
space under both translation and rotation.
