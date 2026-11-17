package cc.quxx.skiurlaub;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class SessionStore {
    private static final String ALIAS = "skiurlaub.session.v1";
    private final SharedPreferences preferences;
    private final byte[] origin;

    SessionStore(Context context, String apiOrigin) {
        preferences = context.getSharedPreferences("skiurlaub-session", Context.MODE_PRIVATE);
        origin = apiOrigin.getBytes(StandardCharsets.UTF_8);
    }

    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(ALIAS)) return (SecretKey) store.getKey(ALIAS, null);
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256).build());
        return generator.generateKey();
    }

    void save(String token, long expiresAt) throws Exception {
        if (!token.matches("skiurlaub_v1_[a-f0-9]{64}") || expiresAt <= System.currentTimeMillis())
            throw new IllegalArgumentException("Invalid app session");
        byte[] data = new JSONObject().put("token", token).put("expiresAt", expiresAt).toString().getBytes(StandardCharsets.UTF_8);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        cipher.updateAAD(origin);
        String value = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP) + "." +
            Base64.encodeToString(cipher.doFinal(data), Base64.NO_WRAP);
        if (!preferences.edit().putString("encrypted", value).commit()) throw new IllegalStateException("Session storage unavailable");
    }

    String token() throws Exception {
        String value = preferences.getString("encrypted", null);
        if (value == null) return null;
        try {
            String[] parts = value.split("\\.", -1);
            if (parts.length != 2) throw new IllegalArgumentException();
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            cipher.updateAAD(origin);
            JSONObject session = new JSONObject(new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8));
            String token = session.getString("token");
            if (session.getLong("expiresAt") <= System.currentTimeMillis() || !token.matches("skiurlaub_v1_[a-f0-9]{64}")) {
                clear();
                return null;
            }
            return token;
        } catch (Exception invalid) {
            // Corruption, device-key loss or another API origin requires a fresh login.
            clear();
            return null;
        }
    }

    void clear() throws Exception {
        if (!preferences.edit().remove("encrypted").commit()) throw new IllegalStateException("Session storage unavailable");
    }
}
