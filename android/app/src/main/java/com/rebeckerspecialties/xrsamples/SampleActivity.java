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
        boolean menu = getIntent().getBooleanExtra("launcher", false);
        if (menu) BabylonNative.runtimeLoadScript(runtime, "app:///Scripts/menu-entry.js");
        if (menu && getIntent().getBooleanExtra("checkHandoff", false)) {
            BabylonNative.runtimeLoadScript(runtime, "app:///Scripts/menu-check.js");
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
