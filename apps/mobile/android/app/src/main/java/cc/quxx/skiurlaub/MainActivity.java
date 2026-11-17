package cc.quxx.skiurlaub;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;
import androidx.activity.EdgeToEdge;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SkiurlaubApiPlugin.class);
        super.onCreate(savedInstanceState);
        // App API authentication uses the Keystore session, never Capacitor's shared cookie jar.
        java.net.CookieHandler.setDefault(null);
        EdgeToEdge.enable(this);
    }
}
