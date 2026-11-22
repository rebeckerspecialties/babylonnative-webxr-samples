# WebXR / WebGPU samples

This Android application depends on the BabylonNative embedding, not Factotum. Its
first fixture is the Immersive Web Community Group's MIT-licensed
[barebones WebGPU sample](https://immersive-web.github.io/webxr-samples/webgpu/vr-barebones.html).
It uses the upstream shader, projection and render loop. The native host supplies
the named canvas and entry action; the browser page retains its Enter VR button.
There is no fallback to WebGL or OpenGL ES.

**Runtime qualification:** the standalone repository's initial BabylonNative
gitlink, `687c98cf24a9678c83717ca75d6b90753668d552`, is the public
before-fix control. It does **not** contain the Quest projection-array and
depth fixes. Device results below require the local corrected runtime via
`BABYLON_NATIVE_DIR`. Do not publish this control gitlink as a working
release: first qualify the same tests from a clean checkout of a reachable
fixed runtime revision, with no local source overrides.

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
"$BABYLON_NATIVE_DIR/Apps/Playground/Android/gradlew" -p android :app:assembleDebug -PARM64Only -PjsEngine=V8
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb shell am start -a android.intent.action.MAIN -c com.oculus.intent.category.VR -n com.rebeckerspecialties.xrsamples/.SampleActivity
```

The sample package coexists with the playback app. In a desk fixture with a
tracked headset facing away from the original local origin, pass
`--ez alignOrigin true` to place the triangle in front of the first tracked
pose. This does not change the mesh, shaders or the WebGPU renderer.

For a local UI build with authorized access to the Factotum source, run
`node buildLauncher.cjs "$FACTOTUM_WORKSPACE" "$BABYLON_NODE_MODULES" "$OUTPUT"`
and set `WEBXR_LAUNCHER_DIR="$OUTPUT"` at Android build time. Use Babylon
9.37.1 core/gui and the existing Factotum workspace dependencies. Pass
`--ez launcher true` to launch the hand selector and modal, or visit
`launcher.html` in the generated browser site. A native desk run can also pass
`--ez checkHandoff true` to exercise close, reopen, selection and the transition
to the raw sample after 120 scene frames. Browser runs require real activation.
Do not distribute the optional generated UI bundle, playback data, or system
captures that show the physical room.
