# WebXR / WebGPU samples

This Android application depends on the BabylonNative embedding, not Factotum. Its
first fixture is the Immersive Web Community Group's MIT-licensed
[barebones WebGPU sample](https://immersive-web.github.io/webxr-samples/webgpu/vr-barebones.html).
It uses the upstream shader, projection and render loop. The native host supplies
the named canvas and entry action; the browser page retains its Enter VR button.
There is no fallback to WebGL or OpenGL ES.

The BabylonNative submodule pins
[`0c5901c9`](https://github.com/rebeckerspecialties/BabylonNative/commit/0c5901c9).
It contains the stereo projection-array, raw controller pose, canvas ink-bound and Adreno depth-clear fixes.
The app uses two-pass WebGPU by default; the pin also includes a separate
opt-in single-pass Babylon material pixel fixture.
Color-only projection now leaves depth unallocated. The Android embedding also
retains its native window through delayed initialization.

Pin `immersive-web/webxr-samples` at `6d548461574f733e2d0578deb32b6f0387735dab`.
The generator checks the input SHA-256 and preserves the copyright notice.
Use JDK 17 or newer on PATH. ImageIO applies the original cube sample's
horizontal canvas mirror once at build time, for both native and browser output.

```sh
python3 prepare.py "$WEBXR_SAMPLES_DIR" /tmp/webxr-samples
```

Serve the generated directory over HTTPS (or localhost) to obtain an unchanged
`webgpu/vr-barebones.html` browser control and `webgpu/checks.html` with the native fixture's
additional assertions. A browser without immersive WebXR **and** WebGPU interop
cannot serve as a graphics control.

The checks cover shared color/depth arrays, distinct eye transforms, ordered
2D slices, the actual requested depth format, and the same-frame inverse
reference-space operation from [ref-space-invert](https://immersive-web.github.io/webxr-samples/tests/ref-space-invert.html).
The upstream tests directory's WebGL renderer is not packaged. The assertions
also project the reported near/far planes into WebGPU clip space. They do not
verify final headset pixels or substitute for WPT. `webgpu/flat-control.html`
uses the same upstream canvas draw and checks for three primary-color regions;
it never simulates an XR device.

For the Android host, set `BABYLON_NATIVE_DIR` and `WEBXR_SAMPLES_DIR` to the
qualified checkouts (or use `third_party/BabylonNative` and `third_party/webxr-samples`).
Use the embedding's normal Android Vulkan/OpenXR toolchain and V8 configuration:

```sh
git submodule update --init --recursive
npm ci
third_party/BabylonNative/Apps/Playground/Android/gradlew -p android :app:assembleQualification -PARM64Only -PjsEngine=V8
adb install -r android/app/build/outputs/apk/qualification/app-qualification.apk
adb shell am start -a android.intent.action.MAIN -c com.oculus.intent.category.VR -n com.rebeckerspecialties.xrsamples/.SampleActivity
```

With the headset awake and tracking, run `python3 android/test-roundtrip.py SERIAL`
to check three independent cold starts. Each process must show the menu, pass
32 stereo frames and show the menu again. This uses normal application logs only.

The sample package coexists with the playback app. In a desk fixture with a
tracked headset facing away from the original local origin, pass
`--ez alignOrigin true` to place the triangle in front of the first tracked
pose. This does not change the mesh, shaders or the WebGPU renderer.

For a local UI build with authorized access to the Factotum source, run
`node buildLauncher.cjs "$FACTOTUM_WORKSPACE" "$BABYLON_NODE_MODULES" "$OUTPUT"`
and set `WEBXR_LAUNCHER_DIR="$OUTPUT"` at Android build time. Use Babylon
9.37.1 core/gui/loaders and the existing Factotum workspace dependencies. A normal
headset launch opens the selector. Tracked controllers use the packaged, attributed
Immersive Web grip models. Choose Next to browse, Run to enter the selected fixture
and press a trigger in the fixture to return. Guided fixtures draw the reported grip
and target-ray poses in both eyes (blue left, amber right); untracked poses disappear.
The unmodified reference page remains available without these markers. Use `--ez launcher false` only to launch
the raw reference without the selector. The public version builds with npm dependencies
alone. For the browser, copy the built launcher and HTML into the generated site and visit
`launcher.html` in the generated browser site. A native desk run can also pass
`--ez checkHandoff true` to exercise selection and the transition
to the raw sample after 120 scene frames. Browser runs require real activation.
Do not distribute the optional generated UI bundle, playback data, or system
captures that show the physical room.

The selector anchors at the first tracked viewer height, ignoring pitch. Squeeze
to recenter. Run and Next use the selecting source's target ray at the time of
the select event; only a tracked grip gets a model. The third guided fixture
alternates full- and three-quarter-scale projection layers.
It checks both transitions across frame boundaries and 64 frames of stereo subimages.
Run `node --test *.test.cjs *.test.mjs` to exercise the control logic without a headset.

### What to qualify on hardware

| Reference pages | Native fixture and acceptance |
| --- | --- |
| proj-layer, proj-multiview | Draw the same near and far triangles in world space for both eyes. Test a known foreground pixel at each eye's independently projected target center, with a small eye-specific color difference to detect aliased slices. Single-pass uses an optional native GPU feature. |
| quad-layer, cyld-layer, eqrt-layer, cube-layer | Submit each real compositor layer. Check orientation, angular coverage, and seams in each eye while turning the head. |
| quad-ab-test, quad-select, destroy-layer | Inspect mixed ordered layers, use an actual selecting ray on the two quads, and reject resubmission of a destroyed layer. Confirm projection restoration. |
| eqrt-video, media-layer-sample | Explicit video uploads and XRMediaBinding are separate cases. Check stereo top/bottom order, advancing decoded pictures and no stale layer after exit. The selector also exercises media cylinders and quads. |
| input-selection-spacewarp | Requires space-warp negotiation, depth and motion vectors. A timewarped projection or high compositor FPS is not this test. No native motion-vector transport yet. |
| proj-multiview-occlusion | An immersive-AR GPU depth-sensing test. Ordinary VR projection depth is not environment depth. No native equivalent in this selector yet. |

The regular and fixed-foveation variants use the same source imagery; a null
fixedFoveation getter fails the latter. A successful getter/setter alone cannot
establish a change in the native density map. The head-sweep variants wait for
at least 15 degrees of tracked rotation, and record the actual angle. Use the display and runtime timing
at the same head-motion/checkpoint to qualify timewarp and foveation. Missing
factories and frame deadlines report failures; no mesh fallback counts as a layer.

Run the pinned WebGPU Input Selection Benchmark from the menu or pass
`--ez selectionBenchmark true` to SampleActivity. It uses the upstream shaders,
ripple compute pass, MSAA, shape sequence, 5 s warmup, 10 s measurement and 95%
keep-up criterion. Only the HTML controls, flat preview and remote model URLs
are adapted. The Android package includes the cube room and both controllers.
Pass `--ez spaceWarp true` as well to require motion-vector reprojection;
rejection is a capability failure, not a lower-scoring run. On Quest 1 the
ordinary benchmark ran to completion and reported fewer than two shapes held
68.4 fps. Stereo tests check actual callback timestamps as well as eye pixels.

### Browser layer reference

From this checkout:

```sh
npm ci --prefix tools/reference
CHROME="/path/to/chrome" node tools/reference/capture.mjs third_party/webxr-samples build/reference
```

This opens the 13 original layers pages in Chromium with IWER and the WebXR
Layers polyfill. It saves screenshots, immersive callback counts and page errors.
These are WebGL visual references only; the Android app remains WebGPU-only.
On Chrome 155 with IWER 2.8, ten pages delivered at least 30 immersive callbacks.
The plain multiview page disabled Enter VR. Spacewarp and multiview occlusion
both attempted immersive entry, but IWER rejected it while their inline session
was active. Both video controls had decoded frames and advancing playback in
the focused browser rerun. Inspect video pixels independently of frame counts.
Compare both images of the timed destruction test. On Quest 1, the pinned native
runtime submits quad, cylinder, equirect and cube images through OpenXR. Direct
media quad, cylinder and equirect layers use an Android decoder surface. Video
uploaded as a WebGPU texture uses a separate, much slower CPU copy. The packaged
clip is stereo top/bottom and requires no network. Use `android/test-layers.py`
for unattended frame, pixel and decoder checks. A pass does not measure optical
alignment, visible seams, motion reprojection quality or GPU foveation.
