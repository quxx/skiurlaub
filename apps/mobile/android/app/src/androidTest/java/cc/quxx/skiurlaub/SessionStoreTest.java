package cc.quxx.skiurlaub;

import android.content.Context;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.After;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class SessionStoreTest {
    // Separate device-protected preferences keep real app sessions untouched.
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext().createDeviceProtectedStorageContext();
    private final String origin = "https://synthetic.example.invalid";
    private final String token = "skiurlaub_v1_" + new String(new char[64]).replace('\0', 'a');
    @After public void clean() throws Exception { new SessionStore(context, origin).clear(); }

    @Test public void encryptedSessionSurvivesStoreRecreation() throws Exception {
        new SessionStore(context, origin).save(token, System.currentTimeMillis() + 60000);
        String stored = context.getSharedPreferences("skiurlaub-session", Context.MODE_PRIVATE).getString("encrypted", "");
        assertFalse(stored.contains(token));
        assertEquals(token, new SessionStore(context, origin).token());
        new SessionStore(context, origin).clear();
        assertNull(new SessionStore(context, origin).token());
    }

    @Test public void anotherOriginAndTamperingRequireLogin() throws Exception {
        new SessionStore(context, origin).save(token, System.currentTimeMillis() + 60000);
        assertNull(new SessionStore(context, "https://other.example.invalid").token());
        context.getSharedPreferences("skiurlaub-session", Context.MODE_PRIVATE).edit().putString("encrypted", "corrupt").commit();
        assertNull(new SessionStore(context, origin).token());
    }

    @Test public void expiredSessionsAreRemoved() throws Exception {
        new SessionStore(context, origin).save(token, System.currentTimeMillis() + 500);
        Thread.sleep(650);
        assertNull(new SessionStore(context, origin).token());
    }
}
