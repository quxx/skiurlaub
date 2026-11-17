/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_WEB_CLIENT_ID?: string;
  readonly VITE_TRIP_START?: string;
  readonly VITE_TRIP_END?: string;
  readonly VITE_TRIP_TIME_ZONE?: string;
  readonly VITE_OPEN_METEO_LATITUDE?: string;
  readonly VITE_OPEN_METEO_LONGITUDE?: string;
  readonly VITE_OPEN_METEO_ELEVATION?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
