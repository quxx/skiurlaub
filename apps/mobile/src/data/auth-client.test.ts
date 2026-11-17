import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { userSchema } from '@skiurlaub/shared';
import { api, authStatus, currentUser, signInWithGoogle } from './auth-client';

const native = vi.hoisted(() => ({
  enabled: true,
  request: vi.fn(),
  googleSignIn: vi.fn(),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => native.enabled },
  registerPlugin: () => ({
    request: native.request,
    googleSignIn: native.googleSignIn,
  }),
}));
beforeEach(() => {
  native.enabled = true;
  vi.stubEnv('VITE_API_BASE_URL', 'https://api.example.invalid');
});

it('keeps Google credentials out of JS and handles account picker cancellation', async () => {
  vi.stubEnv(
    'VITE_GOOGLE_WEB_CLIENT_ID',
    '123456-client.apps.googleusercontent.com',
  );
  native.googleSignIn.mockResolvedValue({
    status: 200,
    data: { authenticated: true },
  });
  expect(await signInWithGoogle()).toBe(true);
  expect(native.googleSignIn).toHaveBeenCalledWith();
  native.googleSignIn.mockResolvedValue({ cancelled: true });
  expect(await signInWithGoogle()).toBe(false);
  native.googleSignIn.mockResolvedValue({
    status: 403,
    data: { error: { message: 'Konto nicht freigegeben.' } },
  });
  await expect(signInWithGoogle()).rejects.toThrow('Konto nicht freigegeben.');
});

it('hides and rejects Google login without native OAuth configuration', async () => {
  vi.stubEnv('VITE_GOOGLE_WEB_CLIENT_ID', '');
  native.request.mockResolvedValue({
    status: 200,
    data: {
      skiline: 'unavailable',
      google: true,
      appEmailCode: false,
      localTestMode: false,
    },
  });
  expect(await authStatus()).toMatchObject({ google: false });
  await expect(signInWithGoogle()).rejects.toThrow('noch nicht eingerichtet');
  expect(native.googleSignIn).not.toHaveBeenCalled();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it('uses the native transport without JS cookies, headers or stored session secrets', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const user = {
    id: crypto.randomUUID(),
    email: 'native@example.invalid',
    displayName: 'Im Schnee',
    sessionExpiresAt: new Date(Date.now() + 10000).toISOString(),
  };
  native.request.mockResolvedValue({ status: 200, data: user });
  expect(await api('/me', userSchema)).toEqual(user);
  expect(native.request).toHaveBeenCalledWith({ path: '/me', method: 'GET' });
  expect(fetch).not.toHaveBeenCalled();
});

it('treats an expired native session as signed out and reports native API errors', async () => {
  native.request.mockResolvedValue({
    status: 401,
    data: { error: { message: 'Bitte anmelden.' } },
  });
  expect(await currentUser()).toBeNull();
  await expect(api('/me', userSchema)).rejects.toThrow('Bitte anmelden.');
});

it('keeps native login unavailable without an explicitly configured backend', async () => {
  vi.stubEnv('VITE_API_BASE_URL', '');
  expect(await currentUser()).toBeNull();
  expect(await authStatus()).toMatchObject({
    appEmailCode: false,
    localTestMode: false,
  });
  expect(native.request).not.toHaveBeenCalled();
});
