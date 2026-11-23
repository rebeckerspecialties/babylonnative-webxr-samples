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
            BabylonNative.runtimeEval(runtime, "globalThis.webxrBenchmarkSpaceWarp=" + getIntent().getBooleanExtra("spaceWarp", false),
                    "app:///Scripts/benchmark-options.js");
        }
        int[] cases = getIntent().getIntArrayExtra("layerChecks");
        if (cases != null && menu) {
            for (int index : cases)
                if ((index < 3 || index >= 55) && index != 100) throw new IllegalArgumentException("Invalid compositor check: " + index);
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
