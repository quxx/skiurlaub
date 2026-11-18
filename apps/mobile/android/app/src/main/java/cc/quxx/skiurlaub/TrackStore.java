package cc.quxx.skiurlaub;

import android.content.Context;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Append-only, app-private track storage. One JSON-lines file per track (one fix per line,
 * so a killed process loses at most the last partial line) plus a small meta file that is
 * replaced atomically. Nothing here leaves the device without an explicit upload.
 */
final class TrackStore {
    private static final String ID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
    private final File dir;

    TrackStore(Context context) {
        dir = new File(context.getFilesDir(), "tracks");
        //noinspection ResultOfMethodCallIgnored
        dir.mkdirs();
    }

    /** Ids come from JavaScript; reject anything that is not a UUID (no path traversal). */
    static boolean validId(String id) {
        return id != null && id.matches(ID_PATTERN);
    }

    private File pointsFile(String id) {
        return new File(dir, id + ".jsonl");
    }

    private File metaFile(String id) {
        return new File(dir, id + ".json");
    }

    synchronized JSONObject create(long now, String altRef) throws Exception {
        String id = UUID.randomUUID().toString();
        JSONObject meta = new JSONObject()
            .put("id", id)
            .put("startedAt", now)
            .put("state", "recording")
            .put("pointCount", 0)
            .put("altRef", altRef)
            .put("schema", 1);
        //noinspection ResultOfMethodCallIgnored
        pointsFile(id).createNewFile();
        writeMeta(meta);
        return meta;
    }

    synchronized void writeMeta(JSONObject meta) throws Exception {
        String id = meta.getString("id");
        if (!validId(id)) throw new IllegalArgumentException();
        File tmp = new File(dir, id + ".json.tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(meta.toString().getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        if (!tmp.renameTo(metaFile(id))) throw new IllegalStateException("meta rename failed");
    }

    synchronized JSONObject readMeta(String id) throws Exception {
        if (!validId(id)) return null;
        File file = metaFile(id);
        if (!file.isFile()) return null;
        try (FileInputStream in = new FileInputStream(file)) {
            byte[] bytes = new byte[(int) Math.min(file.length(), 65536)];
            int read = in.read(bytes);
            return new JSONObject(new String(bytes, 0, Math.max(read, 0), StandardCharsets.UTF_8));
        }
    }

    synchronized void append(String id, JSONObject point) throws Exception {
        if (!validId(id)) throw new IllegalArgumentException();
        try (FileOutputStream out = new FileOutputStream(pointsFile(id), true)) {
            out.write((point.toString() + "\n").getBytes(StandardCharsets.UTF_8));
        }
    }

    /** Reads all complete lines; a torn last line after a crash is skipped. */
    synchronized JSONArray readPoints(String id) throws Exception {
        JSONArray points = new JSONArray();
        if (!validId(id) || !pointsFile(id).isFile()) return points;
        try (BufferedReader reader = new BufferedReader(
            new InputStreamReader(new FileInputStream(pointsFile(id)), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isEmpty()) continue;
                try {
                    points.put(new JSONObject(line));
                } catch (org.json.JSONException ignored) {
                    // partial line
                }
            }
        }
        return points;
    }

    synchronized List<JSONObject> list() throws Exception {
        List<JSONObject> result = new ArrayList<>();
        File[] files = dir.listFiles((d, name) -> name.endsWith(".json"));
        if (files == null) return result;
        for (File file : files) {
            String id = file.getName().substring(0, file.getName().length() - 5);
            JSONObject meta = readMeta(id);
            if (meta != null) result.add(meta);
        }
        Collections.sort(result, new Comparator<JSONObject>() {
            @Override
            public int compare(JSONObject a, JSONObject b) {
                return Long.compare(b.optLong("startedAt"), a.optLong("startedAt"));
            }
        });
        return result;
    }

    synchronized boolean delete(String id) {
        if (!validId(id)) return false;
        boolean a = !pointsFile(id).exists() || pointsFile(id).delete();
        boolean b = !metaFile(id).exists() || metaFile(id).delete();
        return a && b;
    }
}
