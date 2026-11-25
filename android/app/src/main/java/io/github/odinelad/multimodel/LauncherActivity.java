/*
 * Copyright 2020 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package io.github.odinelad.multimodel;

import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import androidx.browser.customtabs.CustomTabsClient;

import com.google.androidbrowserhelper.trusted.TwaLauncher;

import java.util.Arrays;
import java.util.List;



public class LauncherActivity
        extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    

    

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Setting an orientation crashes the app due to the transparent background on Android 8.0
        // Oreo and below. We only set the orientation on Oreo and above. This only affects the
        // splash screen and Chrome will still respect the orientation.
        // See https://github.com/GoogleChromeLabs/bubblewrap/issues/496 for details.
        if (Build.VERSION.SDK_INT > Build.VERSION_CODES.O) {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_USER_PORTRAIT);
        } else {
            setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
        }
    }

    /**
     * Browsers that fully support Trusted Web Activities with notification delegation, so that
     * notifications are shown as coming from this app (not from the website) and the permission
     * prompt is the regular Android one. Some default browsers (for example Samsung Internet on
     * Samsung phones) run TWAs without notification delegation, which shows a website permission
     * prompt and delivers notifications through the browser instead of the app.
     */
    private static final List<String> PREFERRED_BROWSERS = Arrays.asList(
            "com.android.chrome", "com.chrome.beta", "com.chrome.dev", "com.chrome.canary");

    @Override
    protected TwaLauncher createTwaLauncher() {
        // Prefer an installed Chrome channel over the default browser. If none is installed
        // (or it is disabled), fall back to the library's normal choice (the default browser).
        String provider = null;
        try {
            provider = CustomTabsClient.getPackageName(this, PREFERRED_BROWSERS, true);
        } catch (RuntimeException e) {
            provider = null;
        }
        if (provider == null) return super.createTwaLauncher();
        return new TwaLauncher(this, provider, getTaskId());
    }

    @Override
    protected Uri getLaunchingUrl() {
        // Get the original launch Url.
        Uri uri = super.getLaunchingUrl();
        // Tell the web app which Android app version opened it, so Settings > About can show it.
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            long code = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? pi.getLongVersionCode() : pi.versionCode;
            uri = uri.buildUpon().appendQueryParameter("apk", pi.versionName + " (" + code + ")").build();
        } catch (PackageManager.NameNotFoundException | RuntimeException e) {
            // Without the version the app still opens normally.
        }
        return uri;
    }
}
