import { z } from 'zod';
import type { LoginIntent, SkilineAdapter } from './adapter';
import { normalizeExport } from './normalize';
import type { NormalizeReport } from './normalize';
import { classifyRefresh, fail, ok } from './results';
import type { RefreshOutcome, SkilineResult } from './results';
import { ticketRegistrationSchema } from './tickets';
import type { TicketRegistration } from './tickets';

// ---------------------------------------------------------------------------
// LIVE ADAPTER: DISABLED. This module contains NO network code.
//
// The Skiline widget endpoints are undocumented web interfaces. Using them from
// this app requires approval and a successful contract test first. Until then the
// adapter is constructed with `enabled: false` and answers every call with
// `not_approved` without touching the transport. When approved, a real
// `SkilineTransport` (HTTP method, paths, `config` value) is supplied from the
// verified contract; the orchestration, token handling and error mapping below
// are already covered by tests with a fake transport.
// ---------------------------------------------------------------------------

export type SkilineEndpoint =
  'requestLogin' | 'login' | 'createTicket' | 'refreshTickets' | 'getData';
export type TransportResponse = {
  status: number;
  body: unknown;
  retryAfterSeconds?: number;
};
export interface SkilineTransport {
  call(
    endpoint: SkilineEndpoint,
    params: Record<string, unknown>,
  ): Promise<TransportResponse>;
}

// Where provider tokens live. Never the central database in plain text, never
// the repository, never logs. A real vault will use encrypted storage (device
// keystore or encrypted-at-rest with a Worker secret) - decided before activation.
export interface TokenVault {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
  clear(): Promise<void>;
}
export class InMemoryTokenVault implements TokenVault {
  private token: string | null = null;
  async get() {
    return this.token;
  }
  async set(token: string) {
    this.token = token;
  }
  async clear() {
    this.token = null;
  }
}

const SECRET_KEYS = new Set([
  'authtoken',
  'keycloaktoken',
  'code',
  'email',
  'token',
  'password',
]);
// For logging only: replaces values of secret-bearing keys at any depth.
export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6 || value == null || typeof value !== 'object') return value;
  if (Array.isArray(value))
    return value.map((item) => redactSecrets(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEYS.has(key.toLowerCase())
        ? '[redacted]'
        : redactSecrets(item, depth + 1),
    ]),
  );
}

const loginIntentSchema = z.looseObject({
  intent: z.string().min(1).max(512),
  timeout: z.number().int().positive().optional(),
  message: z.string().max(1000).optional(),
});
const loginResultSchema = z.looseObject({
  authToken: z.string().min(1).max(8192),
});
const createdTicketSchema = z.looseObject({
  id: z.union([z.string(), z.number()]),
});

export class LiveSkilineAdapter implements SkilineAdapter {
  readonly kind = 'live' as const;
  constructor(
    private readonly options: {
      enabled: boolean;
      transport: SkilineTransport;
      vault: TokenVault;
      config: string;
      locale: string;
      defaultTimeZone: string;
    },
  ) {}

  private blocked(): SkilineResult<never> | null {
    return this.options.enabled
      ? null
      : fail(
          'not_approved',
          'Die Skiline-Anbindung ist noch nicht freigegeben.',
        );
  }

  private async send(
    endpoint: SkilineEndpoint,
    params: Record<string, unknown>,
    authenticated: boolean,
  ): Promise<SkilineResult<TransportResponse>> {
    const request: Record<string, unknown> = {
      config: this.options.config,
      locale: this.options.locale,
      ...params,
    };
    if (authenticated) {
      const token = await this.options.vault.get();
      if (!token) return fail('auth_expired', 'Bitte verbinde dein Konto.');
      request.authToken = token;
    }
    let response: TransportResponse;
    try {
      response = await this.options.transport.call(endpoint, request);
    } catch {
      // The error text is dropped on purpose: it could contain request data.
      return fail('unknown', 'Skiline ist nicht erreichbar.');
    }
    if (response.status === 401 || response.status === 403) {
      if (authenticated) await this.options.vault.clear();
      return fail('auth_expired', 'Anmeldung abgelaufen.');
    }
    if (response.status === 429)
      return fail(
        'rate_limited',
        'Zu viele Anfragen.',
        response.retryAfterSeconds,
      );
    if (response.status < 200 || response.status >= 300)
      return fail('unknown', 'Unerwartete Antwort von Skiline.');
    return ok(response);
  }

  async requestLogin(email: string): Promise<SkilineResult<LoginIntent>> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    const sent = await this.send('requestLogin', { email }, false);
    if (!sent.ok) return sent;
    const parsed = loginIntentSchema.safeParse(sent.value.body);
    if (!parsed.success)
      return fail('invalid_response', 'Unerwartete Antwort von Skiline.');
    return ok({
      intent: parsed.data.intent,
      timeoutSeconds: parsed.data.timeout ?? 600,
      message: parsed.data.message ?? '',
    });
  }

  async login(
    email: string,
    code: string,
  ): Promise<SkilineResult<{ connected: true }>> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    const sent = await this.send('login', { email, code }, false);
    if (!sent.ok) return sent;
    const parsed = loginResultSchema.safeParse(sent.value.body);
    if (!parsed.success)
      return fail('invalid_response', 'Unerwartete Antwort von Skiline.');
    // Only authToken is kept (in the vault); keycloakToken is deliberately dropped.
    await this.options.vault.set(parsed.data.authToken);
    return ok({ connected: true });
  }

  async disconnect() {
    await this.options.vault.clear();
  }

  async getData(season: string): Promise<SkilineResult<NormalizeReport>> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    const sent = await this.send('getData', { season }, true);
    if (!sent.ok) return sent;
    const normalized = normalizeExport(sent.value.body, {
      defaultTimeZone: this.options.defaultTimeZone,
    });
    return normalized.ok
      ? ok(normalized.report)
      : fail('invalid_response', 'Antwort hat ein unerwartetes Format.');
  }

  async createTicket(
    registration: TicketRegistration,
  ): Promise<SkilineResult<{ ticketId: string }>> {
    const blocked = this.blocked();
    if (blocked) return blocked;
    const parsed = ticketRegistrationSchema.safeParse(registration);
    if (!parsed.success)
      return fail('invalid_response', 'Ungültige oder unbestätigte Anfrage.');
    const { ticket, resortId, date, forceTicketCreation, contractIds } =
      parsed.data;
    const sent = await this.send(
      'createTicket',
      {
        type: ticket.format,
        ...ticket,
        resortId,
        date,
        forceTicketCreation,
        contractIds,
      },
      true,
    );
    if (!sent.ok) return sent;
    const created = createdTicketSchema.safeParse(sent.value.body);
    return created.success
      ? ok({ ticketId: String(created.data.id) })
      : fail('invalid_response', 'Unerwartete Antwort von Skiline.');
  }

  async refreshTickets(ticketId: string): Promise<RefreshOutcome> {
    if (!this.options.enabled)
      return { status: 'unknown', reason: 'not_approved' };
    const sent = await this.send('refreshTickets', { ticketId }, true);
    if (!sent.ok) {
      if (sent.error.kind === 'auth_expired') return { status: 'auth_expired' };
      if (sent.error.kind === 'rate_limited')
        return {
          status: 'rate_limited',
          retryAfterSeconds: sent.error.retryAfterSeconds,
        };
      return { status: 'unknown', reason: sent.error.kind };
    }
    return classifyRefresh(sent.value.body);
  }
}
