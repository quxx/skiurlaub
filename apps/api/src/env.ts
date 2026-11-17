export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  APP_ORIGIN: string;
  AUTH_HMAC_SECRET?: string;
  ALLOWED_EMAILS?: string;
  ENABLE_LOCAL_AUTH?: string;
  AUTH_MAILER?: Fetcher;
  GOOGLE_CLIENT_ID?: string;
  ASSETS?: Fetcher;
}

export function googleLoginEnabled(env: Env, request: Request) {
  return (
    /^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(
      env.GOOGLE_CLIENT_ID ?? '',
    ) &&
    !!env.ALLOWED_EMAILS?.trim() &&
    (isLocal(env, request) ||
      (env.ENVIRONMENT === 'production' &&
        new URL(env.APP_ORIGIN).protocol === 'https:' &&
        (env.AUTH_HMAC_SECRET?.length ?? 0) >= 32))
  );
}

export function isLocal(env: Env, request: Request): boolean {
  const url = new URL(request.url);
  return (
    env.ENVIRONMENT === 'local' &&
    env.ENABLE_LOCAL_AUTH === 'true' &&
    ['127.0.0.1', 'localhost'].includes(url.hostname) &&
    ['127.0.0.1', 'localhost'].includes(new URL(env.APP_ORIGIN).hostname)
  );
}
export function appLoginEnabled(env: Env, request: Request) {
  return (
    isLocal(env, request) ||
    (env.ENVIRONMENT === 'production' &&
      new URL(env.APP_ORIGIN).protocol === 'https:' &&
      (env.AUTH_HMAC_SECRET?.length ?? 0) >= 32 &&
      !!env.AUTH_MAILER &&
      !!env.ALLOWED_EMAILS?.trim())
  );
}
