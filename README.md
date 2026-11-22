# WebXR / WebGPU samples

This Android application depends on the BabylonNative embedding, not Factotum. Its
first fixture is the Immersive Web Community Group's MIT-licensed
[barebones WebGPU sample](https://immersive-web.github.io/webxr-samples/webgpu/vr-barebones.html).
It uses the upstream shader, projection and render loop. The native host supplies
the named canvas and entry action; the browser page retains its Enter VR button.
There is no fallback to WebGL or OpenGL ES.

The BabylonNative submodule pins
[`32466c01`](https://github.com/rebeckerspecialties/BabylonNative/commit/32466c014d84249804cffea500ed3c773b9e0911).
It contains the stereo projection-array and Adreno depth-clear fixes.
The app uses two-pass WebGPU by default; the pin also includes a separate
opt-in single-pass Babylon material pixel fixture.

Pin `immersive-web/webxr-samples` at `6d548461574f733e2d0578deb32b6f0387735dab`.
The generator checks the input SHA-256 and preserves the copyright notice.

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
third_party/BabylonNative/Apps/Playground/Android/gradlew -p android :app:assembleDebug -PARM64Only -PjsEngine=V8
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
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
