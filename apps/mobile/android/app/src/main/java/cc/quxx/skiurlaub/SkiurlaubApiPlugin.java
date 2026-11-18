package cc.quxx.skiurlaub;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import android.os.CancellationSignal;
import androidx.credentials.*;
import androidx.credentials.exceptions.GetCredentialException;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.ClearCredentialException;
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;
import java.util.concurrent.atomic.AtomicBoolean;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "SkiurlaubApi")
public class SkiurlaubApiPlugin extends Plugin {
    private String baseUrl() throws Exception {
        String configured = getConfig().getString("baseUrl", "");
        URI uri = new URI(configured);
        boolean local = BuildConfig.DEBUG && "http".equals(uri.getScheme()) && "127.0.0.1".equals(uri.getHost());
        if ((!"https".equals(uri.getScheme()) && !local) || uri.getHost() == null ||
            uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null ||
            (!uri.getRawPath().isEmpty() && !"/".equals(uri.getRawPath()))) throw new IllegalArgumentException();
        return configured.endsWith("/") ? configured.substring(0, configured.length() - 1) : configured;
    }

    private boolean allowed(String path, String method, boolean local) {
        if ("GET".equals(method)) return "/auth/status".equals(path) || "/me".equals(path) || "/gps-tracks".equals(path) || path.matches("/groups/[a-f0-9-]{36}");
        // Optional GPS module: own tracks only, ids must be UUIDs.
        if ("PUT".equals(method) || "DELETE".equals(method)) return path.matches("/gps-tracks/[a-f0-9-]{36}");
        if ("PATCH".equals(method)) return "/me".equals(path);
        if (!"POST".equals(method)) return false;
        return "/auth/request-code".equals(path) || "/auth/verify-code".equals(path) ||
            "/auth/logout".equals(path) || "/auth/logout-all".equals(path) || (local && "/dev/code".equals(path));
    }

    @PluginMethod
    public void request(PluginCall call) {
        // HTTP and Keystore operations stay off the UI thread and never return a session secret to JS.
        execute(() -> {
            try {
                String base = baseUrl();
                String path = call.getString("path", "");
                String method = call.getString("method", "GET");
                boolean local = BuildConfig.DEBUG && base.startsWith("http://127.0.0.1:");
                if (!allowed(path, method, local)) throw new IllegalArgumentException();
                JSObject result = apiRequest(path, method, call.getObject("body", new JSObject()));
                int status = result.getInt("status");
                if (status >= 200 && status < 300 && ("/auth/logout".equals(path) || "/auth/logout-all".equals(path))) clearGoogleState();
                call.resolve(result);
            } catch (Exception error) { rejectConnection(call); }
        });
    }

    private JSObject apiRequest(String path, String method, JSONObject inputBody) throws Exception {
        HttpURLConnection connection = null;
        try {
            String base = baseUrl();
            SessionStore sessions = new SessionStore(getContext(), base);
            String token = sessions.token();
            connection = (HttpURLConnection) new URI(base + "/api/v1" + path).toURL().openConnection();
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(12000);
            connection.setReadTimeout(12000);
            connection.setUseCaches(false);
            connection.setRequestMethod(method);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("X-Skiurlaub-Client", "android");
            connection.setRequestProperty("X-Skiurlaub-Request", "1");
            if (token != null) connection.setRequestProperty("Authorization", "Bearer " + token);
            if ("POST".equals(method) || "PUT".equals(method) || "PATCH".equals(method)) {
                byte[] body = inputBody.toString().getBytes(StandardCharsets.UTF_8);
                if (body.length > ("PUT".equals(method) ? 1_600_000 : "/auth/google/verify".equals(path) ? 16384 : 4096)) throw new IllegalArgumentException();
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setDoOutput(true);
                try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body); }
            }
            int status = connection.getResponseCode();
            if (status >= 300 && status < 400) throw new IllegalStateException();
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream input = status < 400 ? connection.getInputStream() : connection.getErrorStream()) {
                if (input != null) {
                    byte[] chunk = new byte[4096];
                    int length;
                    while ((length = input.read(chunk)) != -1) {
                        if (bytes.size() + length > 262144) throw new IllegalStateException();
                        bytes.write(chunk, 0, length);
                    }
                }
            }
            JSONObject data = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            if (status >= 200 && status < 300 && ("/auth/verify-code".equals(path) || "/auth/google/verify".equals(path))) {
                sessions.save(data.getString("sessionToken"), data.getLong("expiresAt"));
                data.remove("sessionToken");
                data.remove("expiresAt");
            }
            // The server renews sessions on use; keep the local expiry in step so the
            // app does not discard a token that is still valid server-side.
            if (status == 200 && "/me".equals(path) && token != null && data.has("sessionExpiresAt")) {
                java.text.SimpleDateFormat iso = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US);
                iso.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                long renewed = iso.parse(data.getString("sessionExpiresAt")).getTime();
                if (renewed > System.currentTimeMillis()) sessions.save(token, renewed);
            }
            // A wrong OTP must not destroy an existing session; /me is the authoritative session check.
            if ((status == 401 && "/me".equals(path)) || (status >= 200 && status < 300 &&
                ("/auth/logout".equals(path) || "/auth/logout-all".equals(path)))) sessions.clear();
            JSObject result = new JSObject();
            result.put("status", status);
            result.put("data", JSObject.fromJSONObject(data));
            return result;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private final AtomicBoolean signingIn = new AtomicBoolean(false);
    private volatile CancellationSignal googleCancellation;

    @PluginMethod
    public void googleSignIn(PluginCall call) {
        String clientId = getConfig().getString("googleClientId", "");
        if (!clientId.matches("[0-9]+-[a-z0-9]+\\.apps\\.googleusercontent\\.com")) {
            call.reject("Die Google-Anmeldung ist noch nicht eingerichtet.");
            return;
        }
        if (!signingIn.compareAndSet(false, true)) {
            call.reject("Eine Anmeldung läuft bereits.");
            return;
        }
        execute(() -> {
            try {
                JSObject result = apiRequest("/auth/google/challenge", "POST", new JSObject());
                if (result.getInt("status") != 200) {
                    signingIn.set(false);
                    call.resolve(result);
                    return;
                }
                JSONObject challenge = result.getJSONObject("data");
                String challengeId = challenge.getString("challengeId");
                GetCredentialRequest request = new GetCredentialRequest.Builder().addCredentialOption(
                    new GetSignInWithGoogleOption.Builder(clientId).setNonce(challenge.getString("nonce")).build()).build();
                googleCancellation = new CancellationSignal();
                getActivity().runOnUiThread(() -> {
                    try {
                        CredentialManager.create(getContext()).getCredentialAsync(getActivity(), request, googleCancellation,
                            command -> execute(command), new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                                @Override public void onResult(GetCredentialResponse response) {
                                    try {
                                        if (!GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(response.getCredential().getType())) throw new IllegalArgumentException();
                                        String idToken = GoogleIdTokenCredential.createFrom(response.getCredential().getData()).getIdToken();
                                        JSObject body = new JSObject();
                                        body.put("challengeId", challengeId);
                                        body.put("idToken", idToken);
                                        call.resolve(apiRequest("/auth/google/verify", "POST", body));
                                    } catch (Exception error) { rejectConnection(call); }
                                    finally { signingIn.set(false); googleCancellation = null; }
                                }
                                @Override public void onError(GetCredentialException error) {
                                    signingIn.set(false);
                                    googleCancellation = null;
                                    if (error instanceof GetCredentialCancellationException) {
                                        JSObject cancelled = new JSObject();
                                        cancelled.put("cancelled", true);
                                        call.resolve(cancelled);
                                    } else call.reject("Google-Anmeldung nicht verfügbar. Bitte prüfe dein Google-Konto und versuche es erneut.");
                                }
                            });
                    } catch (Exception error) {
                        signingIn.set(false);
                        googleCancellation = null;
                        rejectConnection(call);
                    }
                });
            } catch (Exception error) {
                signingIn.set(false);
                rejectConnection(call);
            }
        });
    }

    private void clearGoogleState() {
        // Provider state is independent of the already revoked app session.
        try {
            CredentialManager.create(getContext()).clearCredentialStateAsync(new ClearCredentialStateRequest(), null,
                command -> execute(command), new CredentialManagerCallback<Void, ClearCredentialException>() {
                    @Override public void onResult(Void result) { }
                    @Override public void onError(ClearCredentialException error) { }
                });
        } catch (Exception ignored) { }
    }

    @Override protected void handleOnDestroy() {
        CancellationSignal cancellation = googleCancellation;
        if (cancellation != null) cancellation.cancel();
        super.handleOnDestroy();
    }

    private void rejectConnection(PluginCall call) {
        // Never bridge raw provider, network or crypto errors containing credentials.
        call.reject("Die sichere App-Verbindung ist nicht verfügbar. Bitte prüfe die Verbindung und versuche es erneut.");
    }
}
