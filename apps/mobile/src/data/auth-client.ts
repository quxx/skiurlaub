import {
  authStatusSchema,
  challengeSchema,
  userSchema,
} from '@skiurlaub/shared';
import { z } from 'zod';
import { Capacitor, registerPlugin } from '@capacitor/core';

const NativeApi = registerPlugin<{
  googleSignIn(): Promise<{
    cancelled?: boolean;
    status?: number;
    data?: unknown;
  }>;
  request(options: {
    path: string;
    method: string;
    body?: unknown;
  }): Promise<{ status: number; data: unknown }>;
}>('SkiurlaubApi');

const nativeWithoutBackend = () =>
  Capacitor.isNativePlatform() && !import.meta.env.VITE_API_BASE_URL;
function apiBase(): string {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (!configured) return '';
  const url = new URL(configured);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new Error('Die Backend-Adresse muss eine HTTPS-Origin sein.');
  return url.origin;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  method = 'GET',
  input?: unknown,
): Promise<T> {
  if (nativeWithoutBackend())
    throw new ApiError(
      503,
      'Das Backend ist für diese App noch nicht eingerichtet.',
    );
  const native = Capacitor.isNativePlatform();
  const response = native
    ? null
    : await fetch(`${apiBase()}/api/v1${path}`, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        headers:
          method === 'GET'
            ? {}
            : {
                'Content-Type': 'application/json',
                'X-Skiurlaub-Request': '1',
              },
        body: input === undefined ? undefined : JSON.stringify(input),
      });
  const result = native
    ? await NativeApi.request({
        path,
        method,
        ...(input === undefined ? {} : { body: input }),
      })
    : null;
  const value: unknown = result
    ? result.data
    : await response!.json().catch(() => null);
  const status = result ? result.status : response!.status;
  return parseResult(status, value, schema);
}
function parseResult<T>(
  status: number,
  value: unknown,
  schema: z.ZodType<T>,
): T {
  if (status < 200 || status >= 300) {
    const candidate = value as { error?: { message?: unknown } } | null;
    throw new ApiError(
      status,
      typeof candidate?.error?.message === 'string'
        ? candidate.error.message
        : 'Der Dienst ist momentan nicht verfügbar.',
    );
  }
  return schema.parse(value);
}
export const authStatus = async () => {
  if (nativeWithoutBackend())
    return {
      skiline: 'unavailable' as const,
      google: false,
      appEmailCode: false,
      localTestMode: false,
    };
  const status = await api('/auth/status', authStatusSchema);
  return {
    ...status,
    google:
      status.google &&
      Capacitor.isNativePlatform() &&
      !!import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID,
  };
};
export async function signInWithGoogle(): Promise<boolean> {
  if (
    nativeWithoutBackend() ||
    !Capacitor.isNativePlatform() ||
    !import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID
  )
    throw new ApiError(
      503,
      'Die Google-Anmeldung ist noch nicht eingerichtet.',
    );
  const result = await NativeApi.googleSignIn();
  if (result.cancelled === true) return false;
  return parseResult(
    result.status ?? 503,
    result.data,
    z.object({ authenticated: z.literal(true) }),
  ).authenticated;
}
export const requestAppCode = (email: string) =>
  api('/auth/request-code', challengeSchema, 'POST', { email });
export async function currentUser() {
  if (nativeWithoutBackend()) return null;
  try {
    return await api('/me', userSchema);
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
