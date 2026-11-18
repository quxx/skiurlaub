import {
  requestCodeSchema,
  verifyCodeSchema,
  profileUpdateSchema,
  googleVerifySchema,
} from '@skiurlaub/shared';
import type { Env } from './env';
import { appLoginEnabled, isLocal, googleLoginEnabled } from './env';
import { googleChallenge, googleVerify } from './google';
import {
  body,
  checkWriteOrigin,
  HttpError,
  json,
  isNativeRequest,
} from './http';
import { localCode, requestCode, verifyCode } from './auth';
import {
  requireMembership,
  requireSession,
  sessionCookie,
  sessionLifetime,
  userDto,
} from './sessions';
import { skilineIdentityProvider } from './skiline';
import {
  deleteGpsTrack,
  listGpsTracks,
  readGpsTrackData,
  uploadGpsTrack,
} from './gps-tracks';
import {
  deleteSkiingDay,
  importSkilineExport,
  listSkiingDays,
} from './skiing-days';

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  if (!path.startsWith('/api/'))
    return env.ASSETS
      ? env.ASSETS.fetch(request)
      : json(
          { error: { code: 'NOT_FOUND', message: 'Nicht verfügbar.' } },
          404,
        );
  if (method === 'OPTIONS')
    throw new HttpError(
      403,
      'ORIGIN_DENIED',
      'Cross-Origin-Anfragen sind nicht erlaubt.',
    );
  if (!['GET', 'HEAD'].includes(method))
    checkWriteOrigin(request, env.APP_ORIGIN);
  if (path === '/api/v1/health' && method === 'GET')
    return json({ status: 'ok' });
  if (path === '/api/v1/auth/status' && method === 'GET')
    return json({
      skiline: 'unavailable',
      google: googleLoginEnabled(env, request) && isNativeRequest(request),
      appEmailCode: appLoginEnabled(env, request),
      localTestMode: isLocal(env, request),
    });
  if (path === '/api/v1/auth/skiline/start' && method === 'POST') {
    await skilineIdentityProvider.beginLogin();
  }
  if (path === '/api/v1/auth/google/challenge' && method === 'POST')
    return json(await googleChallenge(request, env));
  if (path === '/api/v1/auth/google/verify' && method === 'POST') {
    const input = googleVerifySchema.parse(await body(request, 16384));
    const token = await googleVerify(
      input.challengeId,
      input.idToken,
      request,
      env,
    );
    return json({
      authenticated: true,
      sessionToken: token,
      expiresAt: Date.now() + sessionLifetime,
    });
  }
  if (path === '/api/v1/auth/request-code' && method === 'POST') {
    const input = requestCodeSchema.parse(await body(request));
    return json(await requestCode(input.email, request, env), 202);
  }
  if (path === '/api/v1/auth/verify-code' && method === 'POST') {
    const input = verifyCodeSchema.parse(await body(request));
    const token = await verifyCode(input.challengeId, input.code, request, env);
    if (isNativeRequest(request))
      return json({
        authenticated: true,
        sessionToken: token,
        expiresAt: Date.now() + sessionLifetime,
      });
    return json({ authenticated: true }, 200, {
      'Set-Cookie': sessionCookie(token, request, env),
    });
  }
  if (path === '/api/v1/dev/code' && method === 'POST') {
    const input = verifyCodeSchema
      .pick({ challengeId: true })
      .parse(await body(request));
    return json(localCode(input.challengeId, request, env));
  }
  if (path === '/api/v1/me' && method === 'GET')
    return json(userDto(await requireSession(request, env)));
  if (path === '/api/v1/me' && method === 'PATCH') {
    const current = await requireSession(request, env);
    const input = profileUpdateSchema.parse(await body(request));
    await env.DB.prepare('UPDATE users SET display_name = ? WHERE id = ?')
      .bind(input.displayName, current.id)
      .run();
    return json(userDto({ ...current, display_name: input.displayName }));
  }
  if (path === '/api/v1/auth/logout' && method === 'POST') {
    const current = await requireSession(request, env);
    await env.DB.prepare('DELETE FROM user_sessions WHERE secret_hash = ?')
      .bind(current.session_hash)
      .run();
    return json(
      { authenticated: false },
      200,
      isNativeRequest(request)
        ? {}
        : {
            'Set-Cookie': sessionCookie('', request, env),
          },
    );
  }
  if (path === '/api/v1/auth/logout-all' && method === 'POST') {
    const current = await requireSession(request, env);
    await env.DB.prepare('DELETE FROM user_sessions WHERE user_id = ?')
      .bind(current.id)
      .run();
    return json(
      { authenticated: false },
      200,
      isNativeRequest(request)
        ? {}
        : {
            'Set-Cookie': sessionCookie('', request, env),
          },
    );
  }
  if (path === '/api/v1/skiline/import' && method === 'POST')
    return json(
      await importSkilineExport(
        request,
        env,
        await requireSession(request, env),
      ),
    );
  if (path === '/api/v1/skiing-days' && method === 'GET')
    return json(await listSkiingDays(env, await requireSession(request, env)));
  const skiingDay = path.match(/^\/api\/v1\/skiing-days\/([a-f0-9-]{36})$/);
  if (skiingDay && method === 'DELETE') {
    await deleteSkiingDay(
      env,
      await requireSession(request, env),
      skiingDay[1],
    );
    return json({ deleted: true });
  }
  if (path === '/api/v1/gps-tracks' && method === 'GET')
    return json(await listGpsTracks(env, await requireSession(request, env)));
  const gpsTrack = path.match(
    /^\/api\/v1\/gps-tracks\/([a-f0-9-]{36})(\/data)?$/,
  );
  if (gpsTrack) {
    const user = await requireSession(request, env);
    if (!gpsTrack[2] && method === 'PUT')
      return json(await uploadGpsTrack(request, env, user, gpsTrack[1]));
    if (gpsTrack[2] && method === 'GET')
      return readGpsTrackData(env, user, gpsTrack[1]);
    if (!gpsTrack[2] && method === 'DELETE') {
      await deleteGpsTrack(env, user, gpsTrack[1]);
      return json({ deleted: true });
    }
  }
  const group = path.match(/^\/api\/v1\/groups\/([a-f0-9-]{36})$/);
  if (group && method === 'GET')
    return json(await requireMembership(request, env, group[1]));
  throw new HttpError(404, 'NOT_FOUND', 'Nicht verfügbar.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      if (error instanceof HttpError)
        return json(
          { error: { code: error.code, message: error.message } },
          error.status,
          error.status === 429
            ? { 'Retry-After': String(error.retryAfter ?? 900) }
            : undefined,
        );
      if (error instanceof Error && error.name === 'ZodError')
        return json(
          {
            error: {
              code: 'INVALID_INPUT',
              message: 'Bitte prüfe deine Eingaben.',
            },
          },
          400,
        );
      // Deliberately no request bodies, tokens, emails, provider errors or SQL in logs/responses.
      return json(
        {
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Der Dienst ist momentan nicht verfügbar.',
          },
        },
        503,
      );
    }
  },
};
