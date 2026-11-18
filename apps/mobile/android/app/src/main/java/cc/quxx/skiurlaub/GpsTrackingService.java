package cc.quxx.skiurlaub;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.BatteryManager;
import org.json.JSONArray;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.os.SystemClock;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import org.json.JSONObject;

/**
 * Optional GPS recorder. Never started automatically: only an explicit user action (START)
 * or, after the system killed the process during an active recording, a restore of that
 * same recording. Runs as a visible foreground service (location type) so recording
 * continues with the screen locked. Raw fixes go to {@link TrackStore}; all analysis
 * happens elsewhere.
 */
public class GpsTrackingService extends Service {
    static final String ACTION_START = "cc.quxx.skiurlaub.gps.START";
    static final String ACTION_PAUSE = "cc.quxx.skiurlaub.gps.PAUSE";
    static final String ACTION_RESUME = "cc.quxx.skiurlaub.gps.RESUME";
    static final String ACTION_STOP = "cc.quxx.skiurlaub.gps.STOP";
    private static final String PREFS = "gps";
    private static final String CHANNEL = "tracking";
    private static final int NOTIFICATION_ID = 4711;

    // Experimental adaptive intervals (ms). Faster while moving, slower when standing still.
    private static final long MOVING_MS = 5_000;
    private static final long SLOW_MS = 10_000;
    private static final long STILL_MS = 30_000;
    private static final float MAX_STORED_ACCURACY_M = 100f;

    interface Listener {
        void onStatus(JSONObject status);
    }

    static volatile Listener listener;
    // Live status, readable by the plugin without binding.
    static volatile String state = "idle";
    static volatile String trackId = null;
    static volatile int pointCount = 0;
    static volatile long startedAt = 0;
    static volatile float lastAccuracy = -1;
    static volatile long lastFixAt = 0;
    static volatile long intervalMs = 0;
    static volatile double distanceM = 0;
    static volatile String error = null;
    // Battery log for the battery acceptance test: only in debug builds (removed with the release).
    private static final boolean TRACK_BATTERY = BuildConfig.DEBUG;
    static volatile double batteryStartPct = -1;
    static volatile double batteryPct = -1;

    private FusedLocationProviderClient client;
    private TrackStore store;
    private SharedPreferences prefs;
    private SensorManager sensors;
    private Sensor pressureSensor;
    private volatile float pressureHpa = Float.NaN;
    private volatile long pressureAt = 0;
    private boolean updatesActive = false;
    private boolean useMsl = false;
    private Location previous;
    private long mode = MOVING_MS;
    private int modeVotes = 0;
    private long lastNotificationAt = 0;
    private long lastStatusAt = 0;
    private int lastMetaCount = 0;
    private JSONArray battery = new JSONArray();
    private long lastBatteryAt = 0;

    private final SensorEventListener pressureListener = new SensorEventListener() {
        @Override
        public void onSensorChanged(SensorEvent event) {
            pressureHpa = event.values[0];
            pressureAt = SystemClock.elapsedRealtime();
        }

        @Override
        public void onAccuracyChanged(Sensor sensor, int accuracy) {}
    };

    private final LocationCallback callback = new LocationCallback() {
        @Override
        public void onLocationResult(LocationResult result) {
            for (Location location : result.getLocations()) handle(location);
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        client = LocationServices.getFusedLocationProviderClient(this);
        store = new TrackStore(this);
        prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sensors = (SensorManager) getSystemService(Context.SENSOR_SERVICE);
        pressureSensor = sensors == null ? null : sensors.getDefaultSensor(Sensor.TYPE_PRESSURE);
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (action == null) {
            // The system restarted us after killing the process: only continue a recording
            // the user had explicitly started.
            if (!"recording".equals(prefs.getString("state", "idle"))) {
                stopSelf();
                return START_NOT_STICKY;
            }
            restore();
            return START_STICKY;
        }
        try {
            switch (action) {
                case ACTION_START:
                    start();
                    break;
                case ACTION_PAUSE:
                    pause();
                    break;
                case ACTION_RESUME:
                    resume();
                    break;
                case ACTION_STOP:
                    stop();
                    break;
                default:
                    break;
            }
        } catch (Exception failure) {
            fail("Aufzeichnung fehlgeschlagen.");
        }
        return "idle".equals(state) ? START_NOT_STICKY : START_STICKY;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        stopUpdates();
        super.onDestroy();
    }

    private boolean hasLocationPermission() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
            == PackageManager.PERMISSION_GRANTED;
    }

    private void start() throws Exception {
        if (!"idle".equals(state)) return;
        if (!hasLocationPermission()) {
            fail("Standortberechtigung fehlt.");
            return;
        }
        // One altitude reference per track so MSL and ellipsoid values are never mixed.
        useMsl = Build.VERSION.SDK_INT >= 34;
        JSONObject meta = store.create(System.currentTimeMillis(), useMsl ? "msl" : "ellipsoid");
        trackId = meta.getString("id");
        startedAt = meta.getLong("startedAt");
        pointCount = 0;
        distanceM = 0;
        error = null;
        previous = null;
        lastMetaCount = 0;
        mode = MOVING_MS;
        battery = new JSONArray();
        batteryStartPct = -1;
        state = "recording";
        sampleBattery("start");
        prefs.edit().putString("state", "recording").putString("track", trackId).apply();
        if (!enterForeground()) return;
        startUpdates();
        publish(true);
    }

    private void restore() {
        try {
            String id = prefs.getString("track", null);
            JSONObject meta = store.readMeta(id);
            if (meta == null || !"recording".equals(meta.optString("state"))) {
                clearActive();
                stopSelf();
                return;
            }
            trackId = id;
            startedAt = meta.optLong("startedAt");
            pointCount = meta.optInt("pointCount");
            lastMetaCount = pointCount;
            useMsl = "msl".equals(meta.optString("altRef"));
            distanceM = meta.optDouble("distanceM", 0);
            JSONArray saved = meta.optJSONArray("battery");
            battery = saved == null ? new JSONArray() : saved;
            batteryStartPct = battery.length() > 0 ? battery.getJSONObject(0).optDouble("pct", -1) : -1;
            error = null;
            previous = null;
            state = "recording";
            if (!enterForeground()) return;
            if (!hasLocationPermission()) {
                interrupt("Standortberechtigung entzogen.");
                return;
            }
            startUpdates();
            publish(true);
        } catch (Exception failure) {
            interrupt("Wiederherstellung fehlgeschlagen.");
        }
    }

    private void pause() throws Exception {
        if (!"recording".equals(state)) return;
        stopUpdates();
        sampleBattery("pause");
        state = "paused";
        updateMeta("paused", false);
        prefs.edit().putString("state", "paused").apply();
        notifyNow();
        publish(true);
    }

    private void resume() throws Exception {
        if (!"paused".equals(state)) return;
        state = "recording";
        previous = null;
        sampleBattery("resume");
        updateMeta("recording", false);
        prefs.edit().putString("state", "recording").apply();
        startUpdates();
        notifyNow();
        publish(true);
    }

    private void stop() throws Exception {
        if ("idle".equals(state)) {
            stopSelf();
            return;
        }
        stopUpdates();
        sampleBattery("stop");
        updateMeta("stopped", true);
        clearActive();
        state = "idle";
        publish(true);
        trackId = null;
        batteryPct = -1;
        batteryStartPct = -1;
        stopForeground(STOP_FOREGROUND_REMOVE);
        stopSelf();
    }

    /** Recording could not continue (e.g. the system forbids restarting the service). */
    private void interrupt(String reason) {
        try {
            stopUpdates();
            if (trackId != null) {
                sampleBattery("interrupted");
                updateMeta("interrupted", true);
            }
        } catch (Exception ignored) {
            // best effort
        }
        error = reason;
        clearActive();
        state = "idle";
        publish(true);
        trackId = null;
        stopSelf();
    }

    private void fail(String message) {
        error = message;
        if (trackId != null && !"idle".equals(state)) {
            interrupt(message);
            return;
        }
        state = "idle";
        publish(true);
        stopSelf();
    }

    private void clearActive() {
        prefs.edit().putString("state", "idle").remove("track").apply();
    }

    private void updateMeta(String newState, boolean ended) throws Exception {
        if (trackId == null) return;
        JSONObject meta = store.readMeta(trackId);
        if (meta == null) return;
        meta.put("state", newState).put("pointCount", pointCount).put("distanceM", distanceM);
        if (TRACK_BATTERY) meta.put("battery", battery);
        if (ended) meta.put("endedAt", System.currentTimeMillis());
        store.writeMeta(meta);
        lastMetaCount = pointCount;
    }

    private boolean enterForeground() {
        try {
            Notification notification = buildNotification();
            if (Build.VERSION.SDK_INT >= 29)
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(NOTIFICATION_ID, notification);
            return true;
        } catch (RuntimeException notAllowed) {
            // e.g. ForegroundServiceStartNotAllowedException when restored from the background.
            interrupt("Der Hintergrunddienst konnte nicht gestartet werden.");
            return false;
        }
    }

    private void startUpdates() {
        if (updatesActive || !hasLocationPermission()) return;
        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, mode)
            .setMinUpdateIntervalMillis(mode / 2)
            // Batching saves power with a locked screen; fixes are delivered in groups.
            .setMaxUpdateDelayMillis(mode * 2)
            .setWaitForAccurateLocation(false)
            .build();
        try {
            client.requestLocationUpdates(request, callback, Looper.getMainLooper());
            updatesActive = true;
            intervalMs = mode;
            if (pressureSensor != null && sensors != null)
                sensors.registerListener(pressureListener, pressureSensor, SensorManager.SENSOR_DELAY_NORMAL, 5_000_000);
        } catch (SecurityException denied) {
            interrupt("Standortberechtigung entzogen.");
        }
    }

    private void stopUpdates() {
        if (updatesActive) {
            client.removeLocationUpdates(callback);
            updatesActive = false;
        }
        if (sensors != null) sensors.unregisterListener(pressureListener);
        pressureHpa = Float.NaN;
    }

    private void handle(Location location) {
        if (!"recording".equals(state) || trackId == null) return;
        if (location.hasAccuracy() && location.getAccuracy() > MAX_STORED_ACCURACY_M) return;
        try {
            JSONObject p = new JSONObject();
            p.put("t", location.getTime());
            p.put("lat", location.getLatitude());
            p.put("lon", location.getLongitude());
            if (useMsl) {
                if (Build.VERSION.SDK_INT >= 34 && location.hasMslAltitude()) {
                    p.put("alt", location.getMslAltitudeMeters());
                    if (location.hasMslAltitudeAccuracy()) p.put("vacc", location.getMslAltitudeAccuracyMeters());
                } else if (location.hasAltitude()) {
                    // No mean-sea-level altitude from this provider: keep the ellipsoid altitude as
                    // a fallback. The app uses one reference per track, never a mix.
                    p.put("altE", location.getAltitude());
                }
            } else if (location.hasAltitude()) {
                p.put("alt", location.getAltitude());
                if (Build.VERSION.SDK_INT >= 26 && location.hasVerticalAccuracy())
                    p.put("vacc", location.getVerticalAccuracyMeters());
            }
            if (location.hasAccuracy()) p.put("acc", location.getAccuracy());
            if (location.hasSpeed()) p.put("speed", location.getSpeed());
            if (!Float.isNaN(pressureHpa) && SystemClock.elapsedRealtime() - pressureAt < 15_000)
                p.put("pressureHpa", Math.round(pressureHpa * 100f) / 100.0);
            store.append(trackId, p);
        } catch (Exception writeFailure) {
            // Disk full or similar: never lose the track silently.
            interrupt("Speichern fehlgeschlagen (Speicher voll?).");
            return;
        }
        pointCount++;
        lastAccuracy = location.hasAccuracy() ? location.getAccuracy() : -1;
        lastFixAt = location.getTime();
        if (previous != null) distanceM += previous.distanceTo(location) > 2 ? previous.distanceTo(location) : 0;
        previous = location;
        adapt(location);
        try {
            if (pointCount - lastMetaCount >= 20) updateMeta("recording", false);
        } catch (Exception ignored) {
            // meta is rewritten on the next state change
        }
        long now = SystemClock.elapsedRealtime();
        if (TRACK_BATTERY && now - lastBatteryAt > 600_000) sampleBattery("interval");
        if (now - lastNotificationAt > 15_000) notifyNow();
        if (now - lastStatusAt > 3_000) publish(false);
    }

    private void adapt(Location location) {
        float speed = location.hasSpeed() ? location.getSpeed() : 0f;
        long target = speed >= 1.5f ? MOVING_MS : speed >= 0.5f ? SLOW_MS : STILL_MS;
        if (target == mode) {
            modeVotes = 0;
            return;
        }
        // Hysteresis: several consecutive samples before changing the interval.
        if (++modeVotes >= (target == STILL_MS ? 6 : 3)) {
            mode = target;
            modeVotes = 0;
            if (updatesActive) {
                client.removeLocationUpdates(callback);
                updatesActive = false;
                startUpdates();
            }
        }
    }

    private void publish(boolean force) {
        lastStatusAt = SystemClock.elapsedRealtime();
        if (TRACK_BATTERY && !"idle".equals(state)) batteryPct = currentBatteryPct();
        Listener l = listener;
        if (l != null) l.onStatus(statusJson());
    }

    static JSONObject statusJson() {
        JSONObject json = new JSONObject();
        try {
            json.put("state", state);
            json.put("trackId", trackId == null ? JSONObject.NULL : trackId);
            json.put("pointCount", pointCount);
            json.put("startedAt", startedAt);
            json.put("lastAccuracy", lastAccuracy);
            json.put("lastFixAt", lastFixAt);
            json.put("intervalMs", intervalMs);
            json.put("distanceM", Math.round(distanceM));
            json.put("error", error == null ? JSONObject.NULL : error);
            if (TRACK_BATTERY && batteryPct >= 0) {
                json.put("batteryPct", batteryPct);
                json.put("batteryStartPct", batteryStartPct);
            }
        } catch (org.json.JSONException ignored) {
            // keys are constants
        }
        return json;
    }

    private double currentBatteryPct() {
        Intent intent = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        if (intent == null) return -1;
        int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
        int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
        return level < 0 || scale <= 0 ? -1 : Math.round(level * 1000f / scale) / 10.0;
    }

    /** Appends a battery sample (level, charging, temperature) to the track's meta data. */
    private void sampleBattery(String reason) {
        if (!TRACK_BATTERY) return;
        Intent intent = registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
        double pct = currentBatteryPct();
        if (intent == null || pct < 0) return;
        try {
            JSONObject sample = new JSONObject()
                .put("t", System.currentTimeMillis())
                .put("pct", pct)
                .put("charging", intent.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0)
                .put("reason", reason);
            int temperature = intent.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, Integer.MIN_VALUE);
            if (temperature != Integer.MIN_VALUE) sample.put("tempC", temperature / 10.0);
            if (battery.length() < 300) battery.put(sample);
            if (batteryStartPct < 0) batteryStartPct = pct;
            batteryPct = pct;
            lastBatteryAt = SystemClock.elapsedRealtime();
        } catch (org.json.JSONException ignored) {
            // keys are constants
        }
    }

    private void notifyNow() {
        lastNotificationAt = SystemClock.elapsedRealtime();
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.notify(NOTIFICATION_ID, buildNotification());
    }

    private PendingIntent action(String action, int code) {
        Intent intent = new Intent(this, GpsTrackingService.class).setAction(action);
        return PendingIntent.getService(this, code, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private Notification buildNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && manager != null && manager.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, "GPS-Aufzeichnung", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("Zeigt an, dass eine GPS-Aufzeichnung läuft.");
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        boolean paused = "paused".equals(state);
        String text = (paused ? "Pausiert" : "Aufzeichnung läuft") + " · " + pointCount + " Punkte · "
            + String.format(java.util.Locale.GERMANY, "%.1f km", distanceM / 1000.0);
        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_mountain)
            .setContentTitle("Skiurlaub")
            .setContentText(text)
            .setContentIntent(content)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        if (paused) builder.addAction(0, "Fortsetzen", action(ACTION_RESUME, 2));
        else builder.addAction(0, "Pause", action(ACTION_PAUSE, 1));
        builder.addAction(0, "Beenden", action(ACTION_STOP, 3));
        return builder.build();
    }
}
