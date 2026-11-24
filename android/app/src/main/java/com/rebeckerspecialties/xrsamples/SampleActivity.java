package com.rebeckerspecialties.xrsamples;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import com.babylonjs.embedding.BabylonNative;
import com.library.babylonnative.BabylonView;

public final class SampleActivity extends Activity {
    private long runtime;
    private BabylonView view;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        BabylonNative.setContext(getApplication());
        BabylonNative.setCurrentActivity(this);
        runtime = BabylonNative.runtimeCreate(new BabylonNative.RuntimeOptions());
        BabylonNative.runtimeLoadScript(runtime, "app:///Scripts/babylon_lite_bootstrap.js");
        if (getIntent().getBooleanExtra("alignOrigin", false)) {
            BabylonNative.runtimeLoadScript(runtime, "app:///Scripts/offset.js");
        }
        boolean menu = getIntent().getBooleanExtra("launcher", true);
        if (menu) BabylonNative.runtimeLoadScript(runtime, "app:///Scripts/menu-entry.js");
        if (menu && getIntent().getBooleanExtra("selectionBenchmark", false)) {
            BabylonNative.runtimeEval(runtime, "globalThis.webxrBenchmarkSpaceWarp=" + getIntent().getBooleanExtra("spaceWarp", false)
                    + ";globalThis.webxrBenchmarkTracked=" + getIntent().getBooleanExtra("trackedSelection", false),
                    "app:///Scripts/benchmark-options.js");
        }
        int[] cases = getIntent().getIntArrayExtra("layerChecks");
        if (cases != null && menu) {
            for (int index : cases)
                if ((index < 3 || index >= 55) && (index < 100 || index > 118)) throw new IllegalArgumentException("Invalid compositor check: " + index);
            BabylonNative.runtimeEval(runtime, "globalThis.webxrLayerChecks=" + java.util.Arrays.toString(cases),
                    "app:///Scripts/layer-check-options.js");
        }
        if (menu && getIntent().getBooleanExtra("checkHandoff", false)) {
            BabylonNative.runtimeLoadScript(runtime, "app:///Scripts/menu-check.js");
        }
        if (menu && getIntent().getBooleanExtra("projectionRoundTrip", false)) {
            BabylonNative.runtimeEval(runtime, "globalThis.webxrProjectionRoundTrip=true;globalThis.webxrSamplePage=26",
                    "app:///Scripts/projection-roundtrip.js");
        }
        int inspect = getIntent().getIntExtra("inspectImage", -1);
        if (menu && (inspect >= 3 && inspect <= 6 || inspect >= 10 && inspect <= 13)) {
            final int filmFPS = getIntent().getIntExtra("inspectFilmFPS", 30);
            if (filmFPS != 24 && filmFPS != 30) throw new IllegalArgumentException("Expected 24 or 30 fps film");
            final boolean vp9 = getIntent().getBooleanExtra("inspectVp9Surface", false);
            final int profile = getIntent().getIntExtra("vp9Profile", 0);
            if (vp9 && !(profile == 0 || (profile == 2 && filmFPS == 24))) throw new IllegalArgumentException("Unknown VP9 fixture");
            if (vp9 && inspect != 11) throw new IllegalArgumentException("VP9 Surface inspection requires a media layer");
            if (vp9) {
                for (android.media.MediaCodecInfo info : new android.media.MediaCodecList(android.media.MediaCodecList.REGULAR_CODECS).getCodecInfos()) {
                    if (info.isEncoder() || !java.util.Arrays.asList(info.getSupportedTypes()).contains("video/x-vnd.on2.vp9")) continue;
                    StringBuilder profiles = new StringBuilder();
                    for (android.media.MediaCodecInfo.CodecProfileLevel p : info.getCapabilitiesForType("video/x-vnd.on2.vp9").profileLevels)
                        profiles.append(Integer.toHexString(p.profile)).append(' ');
                    android.util.Log.i("XrVideoCaps", info.getName() + " VP9 profiles (hex): " + profiles);
                }
            }
            BabylonNative.runtimeEval(runtime, "globalThis.webxrInspectImage=true;globalThis.webxrReferenceGrip=" +
                    getIntent().getBooleanExtra("referenceGrip", false) + ";globalThis.webxrInspectGrip=" +
                    getIntent().getBooleanExtra("inspectGrip", true) + ";globalThis.webxrDisableRecorder=" +
                    getIntent().getBooleanExtra("disableRecorder", false) + ";globalThis.webxrInspectFilmFPS=" +
                    filmFPS + ";globalThis.webxrDiagnosePacing=" + getIntent().getBooleanExtra("diagnosePacing", false) +
                    ";globalThis.webxrInspectVp9Profile=" + (vp9 ? profile : -1) + ";globalThis.webxrSamplePage=" + inspect,
                    "app:///Scripts/inspect-image.js");
        }
        BabylonNative.runtimeLoadScript(runtime, "app:///Scripts/main.js");
        if (menu) BabylonNative.runtimeLoadScript(runtime, "app:///Scripts/launcher.js");
        view = new BabylonView(getApplication(), runtime);
        setContentView(view);
    }
    @Override protected void onPause() {
        view.setVisibility(View.GONE);
        BabylonNative.pause();
        super.onPause();
    }
    @Override protected void onResume() {
        super.onResume();
        BabylonNative.resume();
        view.setVisibility(View.VISIBLE);
    }
    @Override protected void onDestroy() {
        if (runtime != 0) BabylonNative.runtimeDestroy(runtime);
        runtime = 0;
        super.onDestroy();
    }
}
