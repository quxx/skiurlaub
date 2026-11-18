import type { LoginIntent, SkilineAdapter } from './adapter';
import { syntheticExport } from './fixtures';
import { normalizeExport } from './normalize';
import type { NormalizeReport } from './normalize';
import { fail, ok } from './results';
import type { RefreshOutcome, SkilineResult } from './results';
import { ticketKey, ticketRegistrationSchema } from './tickets';
import type { TicketRegistration } from './tickets';

export type MockFailure = 'auth_expired' | 'rate_limited' | 'unknown';
const MOCK_CODE = '000000';

// Deterministic in-memory adapter for development and tests. It only accepts
// synthetic @example.invalid addresses so it can never be mistaken for a real login.
export class MockSkilineAdapter implements SkilineAdapter {
  readonly kind = 'mock' as const;
  private connected = false;
  private readonly tickets = new Map<string, string>();
  private readonly failures: MockFailure[] = [];
  private readonly refreshScript: RefreshOutcome[];
  private readonly data: unknown;
  private readonly timeZone: string;

  constructor(
    options: {
      data?: unknown;
      timeZone?: string;
      failNext?: MockFailure[];
      refreshScript?: RefreshOutcome[];
    } = {},
  ) {
    this.data = options.data ?? syntheticExport();
    this.timeZone = options.timeZone ?? 'Europe/Vienna';
    this.failures.push(...(options.failNext ?? []));
    this.refreshScript = [...(options.refreshScript ?? [])];
  }

  failNext(...failures: MockFailure[]) {
    this.failures.push(...failures);
  }

  async requestLogin(email: string): Promise<SkilineResult<LoginIntent>> {
    if (!email.toLowerCase().endsWith('@example.invalid'))
      return fail(
        'not_approved',
        'Der Mock akzeptiert nur synthetische Adressen @example.invalid.',
      );
    return ok({
      intent: 'mock-intent',
      timeoutSeconds: 600,
      message: `Mock: verwende den Code ${MOCK_CODE}.`,
    });
  }

  async login(
    email: string,
    code: string,
  ): Promise<SkilineResult<{ connected: true }>> {
    if (!email.toLowerCase().endsWith('@example.invalid'))
      return fail('not_approved', 'Nur synthetische Adressen erlaubt.');
    if (code !== MOCK_CODE) return fail('invalid_code', 'Code ungültig.');
    this.connected = true;
    return ok({ connected: true });
  }

  async disconnect() {
    this.connected = false;
  }

  private gate(): SkilineResult<never> | null {
    if (!this.connected)
      return fail('auth_expired', 'Bitte verbinde dein Konto erneut.');
    const failure = this.failures.shift();
    if (failure === 'auth_expired') {
      this.connected = false;
      return fail('auth_expired', 'Anmeldung abgelaufen.');
    }
    if (failure === 'rate_limited')
      return fail('rate_limited', 'Zu viele Anfragen.', 60);
    if (failure) return fail('unknown', 'Unbekannter Fehler.');
    return null;
  }

  async getData(season: string): Promise<SkilineResult<NormalizeReport>> {
    void season; // the mock serves one fixed data set for every season
    const blocked = this.gate();
    if (blocked) return blocked;
    const result = normalizeExport(this.data, {
      defaultTimeZone: this.timeZone,
    });
    return result.ok
      ? ok(result.report)
      : fail('invalid_response', 'Antwort hat ein unerwartetes Format.');
  }

  async createTicket(
    registration: TicketRegistration,
  ): Promise<SkilineResult<{ ticketId: string }>> {
    const parsed = ticketRegistrationSchema.safeParse(registration);
    if (!parsed.success)
      return fail('invalid_response', 'Ungültige oder unbestätigte Anfrage.');
    const blocked = this.gate();
    if (blocked) return blocked;
    const key = ticketKey(parsed.data.ticket);
    const existing = [...this.tickets].find(([, value]) => value === key);
    if (existing) return ok({ ticketId: existing[0] });
    const ticketId = `mock-ticket-${this.tickets.size + 1}`;
    this.tickets.set(ticketId, key);
    return ok({ ticketId });
  }

  async refreshTickets(ticketId: string): Promise<RefreshOutcome> {
    const blocked = this.gate();
    if (blocked && !blocked.ok) {
      if (blocked.error.kind === 'auth_expired')
        return { status: 'auth_expired' };
      if (blocked.error.kind === 'rate_limited')
        return {
          status: 'rate_limited',
          retryAfterSeconds: blocked.error.retryAfterSeconds,
        };
      return { status: 'unknown', reason: blocked.error.kind };
    }
    if (!this.tickets.has(ticketId)) return { status: 'not_found' };
    return this.refreshScript.shift() ?? { status: 'unchanged' };
  }
}
