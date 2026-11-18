import { describe, expect, it, vi } from 'vitest';
import {
  InMemoryTokenVault,
  LiveSkilineAdapter,
  MockSkilineAdapter,
  maskedTicketLabel,
  redactSecrets,
  ticketInputSchema,
  ticketKey,
  ticketRegistrationSchema,
} from './index';
import type { SkilineTransport, TicketRegistration } from './index';

const email = 'tester@example.invalid';
const registration = (over: Record<string, unknown> = {}) =>
  ticketRegistrationSchema.parse({
    ticket: { format: 'ChipNumber', nr2: '1234567' },
    resortId: '9001',
    date: '2027-01-10',
    confirmedByUser: true,
    ...over,
  });

describe('Ticketformate', () => {
  it.each([
    [{ format: 'Skidata', nr1: '1', nr2: '2', nr3: '3', nr4: '4' }, true],
    [{ format: 'OCC', nr1: '1', nr2: '2', nr3: '3' }, true],
    [{ format: 'ChipNumber', nr2: '123' }, true],
    [{ format: 'Skidata', nr1: '1', nr2: '2', nr3: '3' }, false],
    [{ format: 'OCC', nr1: '1', nr2: '2' }, false],
    [{ format: 'ChipNumber' }, false],
    [{ format: 'ChipNumber', nr2: '12a' }, false],
    [{ format: 'ChipNumber', nr2: '' }, false],
    [{ format: 'ChipNumber', nr2: '9'.repeat(25) }, false],
    [{ format: 'ChipNumber', nr2: '1', nr1: '2' }, false],
    [{ format: 'Unbekannt', nr2: '1' }, false],
  ])('%j gültig=%s', (input, valid) => {
    expect(ticketInputSchema.safeParse(input).success).toBe(valid);
  });
  it('bildet einen stabilen Schlüssel und maskiert Nummern', () => {
    const ticket = ticketInputSchema.parse({
      format: 'Skidata',
      nr1: '11',
      nr2: '22',
      nr3: '33',
      nr4: '4455',
    });
    expect(ticketKey(ticket)).toBe('Skidata:11-22-33-4455');
    const label = maskedTicketLabel(ticket);
    expect(label).toBe('Skidata ••••4455');
    expect(label).not.toContain('11');
  });
  it('verlangt eine ausdrückliche Nutzerbestätigung zur Registrierung', () => {
    const base = {
      ticket: { format: 'ChipNumber', nr2: '1' },
      resortId: '9001',
      date: '2027-01-10',
    };
    expect(ticketRegistrationSchema.safeParse(base).success).toBe(false);
    expect(
      ticketRegistrationSchema.safeParse({ ...base, confirmedByUser: false })
        .success,
    ).toBe(false);
    expect(
      ticketRegistrationSchema.safeParse({ ...base, confirmedByUser: true })
        .success,
    ).toBe(true);
  });
});

describe('MockSkilineAdapter', () => {
  it('meldet an, liefert normalisierte Tage und gibt keine Tokens heraus', async () => {
    const mock = new MockSkilineAdapter();
    expect((await mock.requestLogin(email)).ok).toBe(true);
    const login = await mock.login(email, '000000');
    expect(login).toEqual({ ok: true, value: { connected: true } });
    const data = await mock.getData('2027');
    expect(data.ok && data.value.days).toHaveLength(3);
    expect(JSON.stringify(data)).not.toMatch(/token/i);
  });
  it('akzeptiert nur synthetische Adressen und den richtigen Code', async () => {
    const mock = new MockSkilineAdapter();
    const real = await mock.requestLogin('jemand@example.com');
    expect(real.ok === false && real.error.kind).toBe('not_approved');
    const wrong = await mock.login(email, '123456');
    expect(wrong.ok === false && wrong.error.kind).toBe('invalid_code');
  });
  it('verlangt eine Verbindung und kann nach Disconnect nichts mehr lesen', async () => {
    const mock = new MockSkilineAdapter();
    const first = await mock.getData('2027');
    expect(first.ok === false && first.error.kind).toBe('auth_expired');
    await mock.login(email, '000000');
    await mock.disconnect();
    const after = await mock.getData('2027');
    expect(after.ok === false && after.error.kind).toBe('auth_expired');
  });
  it('simuliert Fehler: Auth abgelaufen, Rate Limit, unbekannt', async () => {
    const mock = new MockSkilineAdapter({
      failNext: ['rate_limited', 'unknown', 'auth_expired'],
    });
    await mock.login(email, '000000');
    const limited = await mock.getData('2027');
    expect(limited.ok === false && limited.error).toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 60,
    });
    const unknown = await mock.getData('2027');
    expect(unknown.ok === false && unknown.error.kind).toBe('unknown');
    const expired = await mock.getData('2027');
    expect(expired.ok === false && expired.error.kind).toBe('auth_expired');
    // Nach abgelaufener Anmeldung ist erneutes Verbinden nötig.
    const again = await mock.getData('2027');
    expect(again.ok === false && again.error.kind).toBe('auth_expired');
  });
  it('registriert Tickets nur bestätigt, ohne Dubletten', async () => {
    const mock = new MockSkilineAdapter();
    await mock.login(email, '000000');
    const unconfirmed = await mock.createTicket({
      ...registration(),
      confirmedByUser: false,
    } as unknown as TicketRegistration);
    expect(unconfirmed.ok).toBe(false);
    const a = await mock.createTicket(registration());
    const b = await mock.createTicket(registration());
    expect(a.ok && b.ok && a.value.ticketId === b.value.ticketId).toBe(true);
  });
  it('unterscheidet die Refresh-Ergebnisse', async () => {
    const mock = new MockSkilineAdapter({
      refreshScript: [
        { status: 'refreshed', refreshedCount: 1 },
        { status: 'skipped', skippedCount: 1 },
      ],
    });
    await mock.login(email, '000000');
    const created = await mock.createTicket(registration());
    const id = created.ok ? created.value.ticketId : '';
    expect((await mock.refreshTickets(id)).status).toBe('refreshed');
    expect((await mock.refreshTickets(id)).status).toBe('skipped');
    expect((await mock.refreshTickets(id)).status).toBe('unchanged');
    expect((await mock.refreshTickets('gibt-es-nicht')).status).toBe(
      'not_found',
    );
    mock.failNext('rate_limited');
    expect(await mock.refreshTickets(id)).toEqual({
      status: 'rate_limited',
      retryAfterSeconds: 60,
    });
    mock.failNext('auth_expired');
    expect((await mock.refreshTickets(id)).status).toBe('auth_expired');
  });
});

function liveAdapter(
  transport: SkilineTransport,
  enabled: boolean,
  vault = new InMemoryTokenVault(),
) {
  return new LiveSkilineAdapter({
    enabled,
    transport,
    vault,
    config: 'test-config',
    locale: 'de',
    defaultTimeZone: 'Europe/Vienna',
  });
}

describe('LiveSkilineAdapter (standardmäßig gesperrt)', () => {
  it('ruft bei enabled=false niemals den Transport auf', async () => {
    const call = vi.fn();
    const live = liveAdapter({ call }, false);
    const results = [
      await live.requestLogin(email),
      await live.login(email, '000000'),
      await live.getData('2027'),
      await live.createTicket(registration()),
    ];
    for (const result of results)
      expect(result.ok === false && result.error.kind).toBe('not_approved');
    expect(await live.refreshTickets('1')).toEqual({
      status: 'unknown',
      reason: 'not_approved',
    });
    expect(call).not.toHaveBeenCalled();
  });

  it('behält nur den authToken im Vault und gibt keinen Token zurück', async () => {
    const vault = new InMemoryTokenVault();
    const call = vi.fn(async (endpoint: string) =>
      endpoint === 'login'
        ? {
            status: 200,
            body: {
              user: { id: 1 },
              keycloakToken: 'KEYCLOAK-SECRET',
              authToken: 'AUTH-SECRET',
            },
          }
        : { status: 200, body: { skiingDays: [] } },
    );
    const live = liveAdapter({ call }, true, vault);
    const login = await live.login(email, '12345678');
    expect(login).toEqual({ ok: true, value: { connected: true } });
    expect(JSON.stringify(login)).not.toMatch(/SECRET/);
    expect(await vault.get()).toBe('AUTH-SECRET');
    await live.getData('2027');
    expect(call).toHaveBeenLastCalledWith(
      'getData',
      expect.objectContaining({
        authToken: 'AUTH-SECRET',
        season: '2027',
        config: 'test-config',
        locale: 'de',
      }),
    );
    await live.disconnect();
    expect(await vault.get()).toBeNull();
  });

  it('verlangt vor Datenabrufen eine Anmeldung ohne Netzwerkaufruf', async () => {
    const call = vi.fn();
    const result = await liveAdapter({ call }, true).getData('2027');
    expect(result.ok === false && result.error.kind).toBe('auth_expired');
    expect(call).not.toHaveBeenCalled();
  });

  it('bildet HTTP-Zustände ab und räumt bei 401 den Token auf', async () => {
    const vault = new InMemoryTokenVault();
    await vault.set('AUTH-SECRET');
    let response: {
      status: number;
      body: unknown;
      retryAfterSeconds?: number;
    } = { status: 401, body: null };
    const live = liveAdapter({ call: async () => response }, true, vault);
    expect((await live.refreshTickets('1')).status).toBe('auth_expired');
    expect(await vault.get()).toBeNull();
    await vault.set('AUTH-SECRET');
    response = { status: 429, body: null, retryAfterSeconds: 120 };
    expect(await live.refreshTickets('1')).toEqual({
      status: 'rate_limited',
      retryAfterSeconds: 120,
    });
    response = { status: 500, body: null };
    expect((await live.refreshTickets('1')).status).toBe('unknown');
    response = { status: 200, body: { matchingTicketCount: null } };
    expect((await live.refreshTickets('1')).status).toBe('unknown');
    response = {
      status: 200,
      body: { matchingTicketCount: 1, refreshedCount: 1 },
    };
    expect((await live.refreshTickets('1')).status).toBe('refreshed');
  });

  it('gibt Transportfehler ohne Details weiter', async () => {
    const vault = new InMemoryTokenVault();
    await vault.set('AUTH-SECRET');
    const live = liveAdapter(
      {
        call: async () => {
          throw new Error('boom authToken=AUTH-SECRET email=a@b.c');
        },
      },
      true,
      vault,
    );
    const result = await live.getData('2027');
    expect(result.ok === false && result.error.kind).toBe('unknown');
    expect(JSON.stringify(result)).not.toMatch(/AUTH-SECRET|a@b\.c/);
  });

  it('sendet Ticketdaten nur nach bestätigter Registrierung', async () => {
    const vault = new InMemoryTokenVault();
    await vault.set('AUTH-SECRET');
    const call = vi.fn(async () => ({ status: 200, body: { id: 77 } }));
    const live = liveAdapter({ call }, true, vault);
    const refused = await live.createTicket({
      ...registration(),
      confirmedByUser: false,
    } as unknown as TicketRegistration);
    expect(refused.ok).toBe(false);
    expect(call).not.toHaveBeenCalled();
    const created = await live.createTicket(registration());
    expect(created).toEqual({ ok: true, value: { ticketId: '77' } });
    expect(call).toHaveBeenCalledWith(
      'createTicket',
      expect.objectContaining({
        type: 'ChipNumber',
        nr2: '1234567',
        resortId: '9001',
        forceTicketCreation: false,
        contractIds: [],
      }),
    );
  });
});

describe('redactSecrets', () => {
  it('maskiert Token, Code und E-Mail auch verschachtelt', () => {
    const out = JSON.stringify(
      redactSecrets({
        authToken: 'a',
        nested: [{ keycloakToken: 'b', code: '1', Email: 'x@y.z' }],
        ok: 'sichtbar',
      }),
    );
    expect(out).not.toMatch(/"a"|"b"|x@y\.z/);
    expect(out).toContain('sichtbar');
  });
});
