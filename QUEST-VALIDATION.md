# Quest 1 Vulkan qualification

Standalone samples, Android 10, 72 Hz. Ordinary application logging, without
a Vulkan interception layer. The application and display figures describe
different things: callback counts alone do not establish binocular alignment.

| Fixture | Device result |
| --- | --- |
| Quad, cylinder, equirect and cube images, ordered layers, destruction | OpenXR accepted the native layers. Observed about 557–576 callbacks in 8 s. Source textures are packaged in the APK. |
| Direct media quad, cylinder, equirect | Android decoder rendered to OpenXR-owned surfaces. 566–572 callbacks and 7.80–7.97 s media advancement in 8 s. |
| Video on a WebGPU texture | 21–22 callbacks in 8 s. The CPU frame-extraction path is not suitable for real-time video. |
| Two-pass and single-pass stereo, each with and without depth | All four passed distinct per-eye color readback at a world-space target. Near geometry won the depth test. Observed 283–286 callbacks in 4 s. |
| Selection benchmark | Original MSAA and ripple enabled; fewer than two shapes sustained the required 68.4 fps. |
| Projection fixed foveation | Fails: projection returns null. Runtime advertises XR_FB_foveation_vulkan; the Vulkan driver advertises VK_EXT_fragment_density_map. Neither means the application's eye pass uses a density attachment. |
| Application space warp | Required feature rejects before session creation. The older result at a half-rate target was invalid: the sample returned early on a null motion-vector texture. |
| Timewarp | VrApi reported TW=2.85 ms and 72/72 fps in a direct-media quad run. A physical head sweep and optical inspection remain outstanding. |
| Hit test, anchors, hit + anchors, planes + anchors | Included with local assets. Need a tracked AR runtime with the corresponding grants. Quest 1's opaque OpenXR backend cannot qualify AR. |

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
