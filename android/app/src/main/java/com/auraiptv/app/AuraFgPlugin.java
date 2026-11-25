package com.auraiptv.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * AuraFg — держит воспроизведение в фоновом режиме.
 * Запускает foreground-сервис (mediaPlayback + wake lock + MediaSession),
 * пока играет поток. Экран блокировки получает плеер с play/pause/stop.
 */
@CapacitorPlugin(name = "AuraFg")
public class AuraFgPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        String title = call.getString("title", "AURA IPTV");
        String body = call.getString("body", "Playing");
        Context ctx = getContext();
        Intent i = new Intent(ctx, AuraPlaybackService.class);
        i.putExtra("title", title);
        i.putExtra("body", body);
        i.putExtra("playing", true);
        try {
            if (Build.VERSION.SDK_INT >= 26) {
                ctx.startForegroundService(i);
            } else {
                ctx.startService(i);
            }
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("foreground start failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), AuraPlaybackService.class));
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("foreground stop failed: " + e.getMessage(), e);
        }
    }

    /** POST_NOTIFICATIONS на Android 13+ (иначе уведомление сервиса не видно). */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 33 && getActivity() != null) {
                getActivity().runOnUiThread(() ->
                        androidx.core.app.ActivityCompat.requestPermissions(
                                getActivity(),
                                new String[]{android.Manifest.permission.POST_NOTIFICATIONS},
                                1001));
            }
            call.resolve(new JSObject().put("ok", true));
        } catch (Exception e) {
            call.reject("permission request failed: " + e.getMessage(), e);
        }
    }
}