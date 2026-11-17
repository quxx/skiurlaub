import type { CapacitorConfig } from '@capacitor/cli';
import { readFileSync, existsSync } from 'node:fs';
import { parseEnv } from 'node:util';
import path from 'node:path';

// Capacitor runs this config from apps/mobile; match Vite's production env precedence.
const env = Object.assign(
  {},
  ...['.env', '.env.local', '.env.production', '.env.production.local'].map(
    (name) => {
      const file = path.resolve(process.cwd(), '../..', name);
      return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {};
    },
  ),
);

const config: CapacitorConfig = {
  appId: 'cc.quxx.skiurlaub',
  appName: 'Skiurlaub',
  webDir: 'dist',
  server: { androidScheme: 'https' },
  android: { backgroundColor: '#f8f9fc', allowMixedContent: false },
  plugins: {
    SkiurlaubApi: {
      baseUrl: process.env.VITE_API_BASE_URL || env.VITE_API_BASE_URL || '',
      googleClientId:
        process.env.VITE_GOOGLE_WEB_CLIENT_ID ||
        env.VITE_GOOGLE_WEB_CLIENT_ID ||
        '',
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'LIGHT',
      animation: 'NONE',
    },
    SplashScreen: {
      launchAutoHide: false,
      backgroundColor: '#f8f9fc',
      showSpinner: false,
    },
  },
};
export default config;
