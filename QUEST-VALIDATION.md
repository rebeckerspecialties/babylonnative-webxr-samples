# Quest 1 Vulkan qualification

Standalone samples, Android 10, 72 Hz. Ordinary application logging, without
a Vulkan interception layer. The application and display figures describe
different things: callback counts alone do not establish binocular alignment.

| Fixture | Device result |
| --- | --- |
| Quad, cylinder, equirect and cube images, ordered layers, destruction | OpenXR accepted the native layers. Observed about 557–576 callbacks in 8 s. Source textures are packaged in the APK. |
| Direct media quad, cylinder, equirect | Android decoder rendered to OpenXR-owned surfaces. 566–572 callbacks and 7.80–7.97 s media advancement in 8 s. |
| Video on a WebGPU texture | Same 960×1080 packed 30 fps source, eight seconds: 42 XR callbacks with the single packed snapshot; 556 and 553 with the streaming decoder. After timing, GPU RGB readbacks changed in both packed eye regions on both runs. Direct equirect/cylinder/quad controls delivered 567/568/572 callbacks. |
| Two-pass and single-pass stereo, each with and without depth | All four passed distinct per-eye foreground and silhouette readbacks at a world-space target. Probed the center and both sides of each projected edge; near geometry won the depth test. IPD in head coordinates was 66.36 mm with left/right in the correct order. Observed 286–287 callbacks in 4 s. |
| Selection benchmark | Original MSAA and ripple enabled; fewer than two shapes sustained the required 68.4 fps. |
| Projection fixed foveation | Check 101: at the recommended 1216×1344 eye extent, 16×16 checkerboards in both eyes measured 240 alternating horizontal edges in center and periphery at level zero. At maximum they measured 240 centrally and zero peripherally. Returning to zero restored all four counts to 240. Two-pass and multiview silhouettes passed with and without depth at level one (51–54). Other eye extents do not advertise this map. |
| Application space warp | Check 100 requests the required feature, renders full stereo color (1216×1344) with separate RGBA16F motion and depth32float (304×336), and requires successful OpenXR submission of the stereo warp chain. It alternates missing-eye, complete and missing-motion frames. The full sequence plus streaming and direct media controls passed on Quest 1. The number of frames synthesized by the compositor was not measured. |
| Timewarp | VrApi reported TW=2.85 ms and 72/72 fps in a direct-media quad run. A physical head sweep and optical inspection remain outstanding. |
| Combined foveation, space warp and media | Checks 102–104: enabled maximum fixed foveation, submitted stereo motion/depth alongside a playing direct quad, cylinder or equirect. In four seconds, 139/143/143 application frames; the three videos advanced 4.03/3.80/3.81 seconds. Test 36 independently observed changed decoded video pixels in both packed eye regions at 553 XR callbacks in eight seconds with high foveation. |
| Hit test, anchors, hit + anchors, planes + anchors | Included with local assets. Need a tracked AR runtime with the corresponding grants. Quest 1's opaque OpenXR backend cannot qualify AR. |

At runtime revision `fc3903db`, the three combined warp/direct-media checks
delivered 145/141/144 frames in four seconds. Streaming video after the
combined sequence delivered 382 callbacks in eight seconds; three consecutive
repeats after a quad warp run delivered 549/552/552. Both eye regions changed
in all four runs. The transition variance remains unexplained.

The interactive Run path in the [Release qualification APK at 0d89aee](https://github.com/rebeckerspecialties/babylonnative-webxr-samples/actions/runs/45286200180)
displayed the upstream photograph in both eyes for both the [quad](qualification/quest-1/interactive-quad.png)
and [cylinder](qualification/quest-1/interactive-cylinder.png). These are unmodified Android display captures
from the Quest, not pre-composition texture readbacks. Each run also verified four texels on the actual
layer subimage and returned to the selector (1,074 and 1,085 callbacks in the 16-second inspection,
respectively). The launcher anchors the layer once to the user's Run pose, so it starts in front
of the headset without following subsequent head movements. An initial successful upload or an
increasing frame count alone does not test visible placement. For a fresh side-by-side capture,
run `python android/verify-displayed-image.py capture.png` with `opencv-python-headless==4.11.0.86`.
The reference match found 734/756 geometrically consistent points in the quad and 1,032/1,020
in the cylinder (left/right). Blanking either eye makes the check fail. The host regression
checks the matcher on these recorded inputs; a new APK still needs a new on-device capture.

To repeat through the same Run handler, start `.SampleActivity` with `--ei inspectImage 3` (quad)
or `--ei inspectImage 4` (cylinder). Capture the display during the inspection. The automated batch
runner separately releases the activity after its last session rather than leaving an empty activity
over Home. On the [hosted Release renderer](https://github.com/rebeckerspecialties/babylonnative-webxr-samples/actions/runs/45283507108),
combined foveation, motion/depth and direct media delivered 141/143/142 app callbacks in four
seconds. Three subsequent eight-second streaming-video runs delivered 453/456/468 callbacks with
changed RGB in both eye regions. Debug-renderer results are not comparable to these Release figures.

The unmodified [CI APK at 3e9719c](https://github.com/rebeckerspecialties/babylonnative-webxr-samples/actions/runs/45160177937)
passed the 14 default Android layer checks on the Quest. To run the suite on another headset:
`python3 android/test-layers.py SERIAL`. For just the projection silhouettes, use
`python3 android/test-layers.py SERIAL 25 26 27 28`; the reported eye separation comes
from the headset, not a hard-coded 66 mm camera. Those readbacks precede lens distortion.

The menu also completed a real Babylon session → raw WebGPU two-pass color/depth
fixture → new tracked Babylon session round trip in one process. Use
`adb shell am start -S -n com.rebeckerspecialties.xrsamples/.SampleActivity --ez projectionRoundTrip true`
and watch for `XR projection menu returned`. The test leaves the selector in view
for an actual trigger press. Unit tests cover stale-session input, rebinding,
repeat notifications and disposal; the round trip does not synthesize a controller click.

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
