import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { useAndroidBack } from '@/app/NativeLifecycle';
import { ThemePicker } from '@/app/ThemeProvider';
import { Link } from 'react-router';
import { CreditCard, ChevronRight } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { userSchema } from '@skiurlaub/shared';
import googleSignInIcon from '@/assets/google-signin.png';
import {
  api,
  ApiError,
  authStatus,
  currentUser,
  requestAppCode,
  signInWithGoogle,
} from '@/data/auth-client';

const authenticated = z.object({ authenticated: z.boolean() });
const codeSchema = z.object({ code: z.string().regex(/^\d{8}$/) });
const errorMessage = (error: Error | null, id?: string) =>
  error ? (
    <p id={id} role="alert" className="auth-error">
      {error.message}
    </p>
  ) : null;

export function ProfilePage() {
  const client = useQueryClient();
  const codeInput = useRef<HTMLInputElement>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const status = useQuery({
    queryKey: ['auth', 'status'],
    queryFn: authStatus,
    retry: false,
  });
  const me = useQuery({
    queryKey: ['private', 'me'],
    queryFn: currentUser,
    retry: false,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<string | null>(null);
  useAndroidBack(
    () => {
      if (confirmAll) setConfirmAll(false);
      else {
        setChallenge(null);
        setCode('');
      }
    },
    confirmAll || challenge !== null,
  );
  const [name, setName] = useState<string | null>(null);
  const send = useMutation({
    mutationFn: requestAppCode,
    onSuccess: (result) => {
      setChallenge(result.challengeId);
      setCode('');
    },
  });
  const google = useMutation({
    mutationFn: signInWithGoogle,
    onSuccess: async (signedIn) => {
      if (signedIn) {
        setChallenge(null);
        setCode('');
        await client.invalidateQueries({ queryKey: ['private', 'me'] });
      }
    },
  });
  const verify = useMutation({
    mutationFn: () =>
      api('/auth/verify-code', authenticated, 'POST', {
        challengeId: challenge,
        code,
      }),
    onSuccess: async () => {
      setChallenge(null);
      setCode('');
      await client.invalidateQueries({ queryKey: ['private', 'me'] });
    },
  });
  const preview = useMutation({
    mutationFn: () =>
      api('/dev/code', codeSchema, 'POST', { challengeId: challenge }),
    onSuccess: (result) => setCode(result.code),
  });
  const save = useMutation({
    mutationFn: () =>
      api('/me', userSchema, 'PATCH', {
        displayName: name ?? me.data?.displayName,
      }),
    onSuccess: (result) => {
      client.setQueryData(['private', 'me'], result);
      setName(null);
    },
  });
  const logout = useMutation({
    mutationFn: (all: boolean) =>
      api(all ? '/auth/logout-all' : '/auth/logout', authenticated, 'POST', {}),
    onSuccess: () => {
      client.setQueryData(['private', 'me'], null);
      client.removeQueries({
        predicate: (query) =>
          query.queryKey[0] === 'private' && query.queryKey[1] !== 'me',
      });
      setName(null);
      setConfirmAll(false);
      setEmail('');
      setCode('');
      setChallenge(null);
      save.reset();
      verify.reset();
      send.reset();
      google.reset();
    },
  });

  useEffect(() => {
    if (challenge) codeInput.current?.focus();
  }, [challenge]);
  useEffect(() => {
    if (confirmAll) document.getElementById('confirm-logout-all')?.focus();
  }, [confirmAll]);
  const invalidCode =
    verify.error instanceof ApiError &&
    [400, 401].includes(verify.error.status);

  return (
    <section className="empty-page profile-page">
      <section className="settings-group" aria-label="App-Einstellungen">
        <ThemePicker />
      </section>
      <Link className="resort-row action-row profile-passes" to="/skipaesse">
        <CreditCard size={24} strokeWidth={1.8} aria-hidden="true" />
        <div>
          <h2>Skipässe</h2>
          <p>Verwaltung noch nicht verfügbar</p>
        </div>
        <ChevronRight size={22} aria-hidden="true" />
      </Link>
      {(status.isPending || me.isPending) && (
        <p role="status">Anmeldung wird geprüft …</p>
      )}
      {(status.error || me.error) && (
        <div className="auth-panel">
          {errorMessage(status.error ?? me.error)}
          <Button
            onClick={() => {
              void status.refetch();
              void me.refetch();
            }}
          >
            Erneut versuchen
          </Button>
        </div>
      )}
      {me.data ? (
        <div className="auth-panel">
          <h2>Dein Profil</h2>
          <p>
            Du bist angemeldet. Deine E-Mail-Adresse ist nur für dich sichtbar.
          </p>
          <div className="profile-header">
            <span className="avatar" aria-hidden="true">
              {(me.data.displayName || me.data.email)
                .trim()
                .charAt(0)
                .toUpperCase()}
            </span>
            <div>
              <strong>{me.data.displayName}</strong>
              <span>{me.data.email}</span>
            </div>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <label htmlFor="display-name">Anzeigename</label>
            <input
              id="display-name"
              name="displayName"
              autoComplete="nickname"
              value={name ?? me.data.displayName}
              onChange={(event) => setName(event.target.value)}
              minLength={1}
              maxLength={60}
              required
            />
            <div className="auth-actions">
              <Button
                type="submit"
                variant="primary"
                static
                busy={save.isPending}
                disabled={name === null || name.trim() === me.data.displayName}
              >
                {save.isPending ? 'Wird gespeichert …' : 'Profil speichern'}
              </Button>
            </div>
            {errorMessage(save.error)}
            <div className="auth-feedback" role="status">
              {save.isSuccess ? 'Profil gespeichert.' : ''}
            </div>
          </form>
          <div className="auth-actions auth-session-actions">
            <Button
              variant="secondary"
              onClick={() => logout.mutate(false)}
              busy={logout.isPending}
            >
              Abmelden
            </Button>
            <Button
              id="all-sessions-trigger"
              variant="danger"
              onClick={() => setConfirmAll(true)}
              disabled={logout.isPending}
            >
              Alle Sitzungen beenden
            </Button>
          </div>
          {confirmAll && (
            <div
              className="auth-confirmation"
              role="group"
              aria-label="Alle Sitzungen beenden bestätigen"
            >
              <p>
                Du wirst auf allen Geräten abgemeldet. Deine gespeicherten Daten
                bleiben erhalten.
              </p>
              <div className="auth-actions">
                <Button
                  id="confirm-logout-all"
                  variant="danger"
                  static
                  onClick={() => logout.mutate(true)}
                  busy={logout.isPending}
                >
                  Ja, alle beenden
                </Button>
                <Button
                  variant="text"
                  onClick={() => {
                    setConfirmAll(false);
                    document.getElementById('all-sessions-trigger')?.focus();
                  }}
                >
                  Abbrechen
                </Button>
              </div>
            </div>
          )}
          {errorMessage(logout.error)}
        </div>
      ) : (
        !me.isPending &&
        !me.error &&
        status.data && (
          <div className="auth-panel">
            <h2>Anmelden</h2>
            <p>
              Dein Konto verbindet später deine Skitage, Gruppe und Skipässe.
            </p>
            {status.data.localTestMode && (
              <p className="auth-notice">
                Lokaler Testmodus: Verwende beispielsweise test@example.invalid.
                Es werden keine E-Mails versendet und keine Skiline-Konten
                verbunden.
              </p>
            )}
            {status.data.google && (
              <>
                <div className="auth-actions">
                  <Button
                    className="google-sign-in"
                    variant="secondary"
                    static
                    busy={google.isPending}
                    disabled={send.isPending || verify.isPending || !!challenge}
                    onClick={() => google.mutate()}
                  >
                    <img src={googleSignInIcon} width={40} height={40} alt="" />
                    Mit Google anmelden
                  </Button>
                </div>
                <p className="auth-feedback" role="status">
                  {google.isPending ? 'Google-Anmeldung läuft …' : ''}
                </p>
                {errorMessage(google.error)}
              </>
            )}
            {!status.data.appEmailCode ? (
              !status.data.google && (
                <p className="auth-notice">
                  Die Anmeldung ist noch nicht freigeschaltet.
                </p>
              )
            ) : (
              <>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    setChallenge(null);
                    verify.reset();
                    preview.reset();
                    send.mutate(email);
                  }}
                >
                  <label htmlFor="login-email">E-Mail-Adresse</label>
                  <input
                    id="login-email"
                    type="email"
                    name="email"
                    autoComplete="email"
                    placeholder={
                      status.data.localTestMode
                        ? 'test@example.invalid'
                        : 'du@beispiel.de'
                    }
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    readOnly={!!challenge}
                    aria-describedby={
                      send.error ? 'login-email-error' : undefined
                    }
                    required
                    maxLength={254}
                  />
                  {!challenge && (
                    <div className="auth-actions">
                      <Button
                        type="submit"
                        variant="primary"
                        static
                        busy={send.isPending}
                        disabled={google.isPending}
                      >
                        {send.isPending
                          ? 'Code wird angefordert …'
                          : 'Code anfordern'}
                      </Button>
                    </div>
                  )}
                  {errorMessage(send.error, 'login-email-error')}
                </form>
                {challenge && (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      verify.mutate();
                    }}
                  >
                    <p>
                      Falls die Adresse zugelassen ist, wurde ein Code
                      angefordert.
                    </p>
                    <label htmlFor="login-code">Einmalcode</label>
                    <input
                      ref={codeInput}
                      id="login-code"
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{8}"
                      minLength={8}
                      maxLength={8}
                      value={code}
                      onChange={(event) =>
                        setCode(
                          event.target.value.replace(/\D/g, '').slice(0, 8),
                        )
                      }
                      aria-invalid={invalidCode || undefined}
                      aria-describedby={
                        verify.error
                          ? 'login-code-help login-code-error'
                          : 'login-code-help'
                      }
                      required
                    />
                    <p id="login-code-help" className="field-help">
                      8 Ziffern · 10 Minuten gültig
                    </p>
                    {errorMessage(verify.error, 'login-code-error')}
                    <div className="auth-actions">
                      <Button
                        type="submit"
                        variant="primary"
                        static
                        busy={verify.isPending}
                      >
                        {verify.isPending ? 'Code wird geprüft …' : 'Anmelden'}
                      </Button>
                      {status.data.localTestMode && (
                        <Button
                          variant="secondary"
                          onClick={() => preview.mutate()}
                          busy={preview.isPending}
                        >
                          Lokalen Testcode übernehmen
                        </Button>
                      )}
                      <Button
                        variant="text"
                        onClick={() => {
                          setChallenge(null);
                          setCode('');
                          verify.reset();
                          preview.reset();
                        }}
                      >
                        Neue Anmeldung starten
                      </Button>
                    </div>
                    {errorMessage(preview.error)}
                  </form>
                )}
              </>
            )}
          </div>
        )
      )}
    </section>
  );
}
