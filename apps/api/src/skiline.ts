import { HttpError } from './http';

// Only backend-validated identities may enter a future identity-to-session exchange.
// No route accepts a browser-provided subject, email, cookie, authToken or Keycloak token as proof.
export interface VerifiedSkilineIdentity {
  issuer: string;
  subject: string;
  verifiedAt: number;
}
export interface SkilineIdentityProvider {
  beginLogin(): Promise<{ authorizationUrl: string }>;
  completeLogin(code: string, state: string): Promise<VerifiedSkilineIdentity>;
}
export const skilineIdentityProvider: SkilineIdentityProvider = {
  async beginLogin() {
    throw new HttpError(
      503,
      'SKILINE_NOT_APPROVED',
      'Die Skiline-Anmeldung ist noch nicht für diese App freigeschaltet.',
    );
  },
  async completeLogin() {
    throw new HttpError(
      503,
      'SKILINE_NOT_APPROVED',
      'Ein freigegebener Skiline-Identitätsnachweis fehlt.',
    );
  },
};
