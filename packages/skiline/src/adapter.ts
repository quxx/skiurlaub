import type { NormalizeReport } from './normalize';
import type { RefreshOutcome, SkilineResult } from './results';
import type { TicketRegistration } from './tickets';

export type LoginIntent = {
  intent: string;
  timeoutSeconds: number;
  message: string;
};

// Everything Skiline-specific sits behind this interface. Adapters never hand
// provider tokens (authToken, keycloakToken) to callers.
export interface SkilineAdapter {
  readonly kind: 'mock' | 'live';
  requestLogin(email: string): Promise<SkilineResult<LoginIntent>>;
  login(
    email: string,
    code: string,
  ): Promise<SkilineResult<{ connected: true }>>;
  disconnect(): Promise<void>;
  getData(season: string): Promise<SkilineResult<NormalizeReport>>;
  // Only with an explicit, user-confirmed registration (see ticketRegistrationSchema).
  createTicket(
    registration: TicketRegistration,
  ): Promise<SkilineResult<{ ticketId: string }>>;
  refreshTickets(ticketId: string): Promise<RefreshOutcome>;
}
