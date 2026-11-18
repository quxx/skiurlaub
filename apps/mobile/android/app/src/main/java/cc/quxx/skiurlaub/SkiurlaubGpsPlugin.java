package cc.quxx.skiurlaub;

import android.Manifest;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.List;
import org.json.JSONObject;

/**
 * Bridge to the optional GPS recorder. Recording only starts with an explicit call that
 * carries `consent: true` (the app shows the consent text first). Raw tracks stay in
 * app-private storage until the user uploads them.
 */
@CapacitorPlugin(
    name = "SkiurlaubGps",
    permissions = {
        @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
        @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
    }
)
public class SkiurlaubGpsPlugin extends Plugin {
    private TrackStore store;

    @Override
    public void load() {
        store = new TrackStore(getContext());
        GpsTrackingService.listener = new GpsTrackingService.Listener() {
            @Override
            public void onStatus(JSONObject status) {
                try {
                    notifyListeners("status", JSObject.fromJSONObject(status));
                } catch (org.json.JSONException ignored) {
                    // status keys are constants
                }
            }
        };
    }

    @Override
    protected void handleOnDestroy() {
        GpsTrackingService.listener = null;
        super.handleOnDestroy();
    }

    private JSObject permissionSummary() {
        JSObject result = new JSObject();
        result.put("location", getPermissionState("location") == PermissionState.GRANTED);
        result.put("notifications", getPermissionState("notifications") == PermissionState.GRANTED);
        return result;
    }

    @PluginMethod
    public void getPermissions(PluginCall call) {
        call.resolve(permissionSummary());
    }

    @PluginMethod
    public void requestTrackingPermissions(PluginCall call) {
        if (getPermissionState("location") == PermissionState.GRANTED
            && getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(permissionSummary());
            return;
        }
        requestPermissionForAliases(new String[] { "location", "notifications" }, call, "permissionsDone");
    }

    @PermissionCallback
    private void permissionsDone(PluginCall call) {
        call.resolve(permissionSummary());
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            call.resolve(JSObject.fromJSONObject(GpsTrackingService.statusJson()));
        } catch (Exception failure) {
            call.reject("Status nicht verfügbar.");
        }
    }

    private void send(String action) {
        Intent intent = new Intent(getContext(), GpsTrackingService.class).setAction(action);
        ContextCompat.startForegroundService(getContext(), intent);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!Boolean.TRUE.equals(call.getBoolean("consent", false))) {
            call.reject("Die Zustimmung zur Aufzeichnung fehlt.");
            return;
        }
        if (getPermissionState("location") != PermissionState.GRANTED) {
            call.reject("Die Standortberechtigung fehlt.");
            return;
        }
        if (!"idle".equals(GpsTrackingService.state)) {
            call.reject("Es läuft bereits eine Aufzeichnung.");
            return;
        }
        send(GpsTrackingService.ACTION_START);
        call.resolve();
    }

    @PluginMethod
    public void pause(PluginCall call) {
        send(GpsTrackingService.ACTION_PAUSE);
        call.resolve();
    }

    @PluginMethod
    public void resume(PluginCall call) {
        send(GpsTrackingService.ACTION_RESUME);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        send(GpsTrackingService.ACTION_STOP);
        call.resolve();
    }

    @PluginMethod
    public void listTracks(PluginCall call) {
        try {
            JSArray tracks = new JSArray();
            List<JSONObject> list = store.list();
            for (JSONObject meta : list) tracks.put(meta);
            JSObject result = new JSObject();
            result.put("tracks", tracks);
            call.resolve(result);
        } catch (Exception failure) {
            call.reject("Aufzeichnungen konnten nicht gelesen werden.");
        }
    }

    @PluginMethod
    public void readTrack(PluginCall call) {
        String id = call.getString("id");
        if (!TrackStore.validId(id)) {
            call.reject("Ungültige Aufzeichnung.");
            return;
        }
        // The running recording is still being written; only finished tracks are read here.
        if (id.equals(GpsTrackingService.trackId)) {
            call.reject("Die Aufzeichnung läuft noch.");
            return;
        }
        execute(() -> {
            try {
                JSONObject meta = store.readMeta(id);
                if (meta == null) {
                    call.reject("Aufzeichnung nicht gefunden.");
                    return;
                }
                JSObject result = new JSObject();
                result.put("meta", meta);
                result.put("points", store.readPoints(id));
                call.resolve(result);
            } catch (Exception failure) {
                call.reject("Aufzeichnung konnte nicht gelesen werden.");
            }
        });
    }

    @PluginMethod
    public void deleteTrack(PluginCall call) {
        String id = call.getString("id");
        if (!TrackStore.validId(id) || id.equals(GpsTrackingService.trackId)) {
            call.reject("Aufzeichnung kann nicht gelöscht werden.");
            return;
        }
        if (!store.delete(id)) {
            call.reject("Löschen fehlgeschlagen.");
            return;
        }
        call.resolve();
    }
}
