import { z } from 'zod';
import { resortIdSchema } from './ids';

// Field requirements follow the observed ticket formats. The digit limit is a
// deliberately generous PROVISIONAL bound (real lengths are not verified); it
// exists to reject garbage and oversized input, not to define the formats.
export const PROVISIONAL_MAX_DIGITS = 24;
const digits = z
  .string()
  .trim()
  .regex(/^\d+$/, 'Nur Ziffern erlaubt.')
  .max(PROVISIONAL_MAX_DIGITS);

export const skidataTicketSchema = z
  .object({
    format: z.literal('Skidata'),
    nr1: digits,
    nr2: digits,
    nr3: digits,
    nr4: digits,
  })
  .strict();
export const occTicketSchema = z
  .object({
    format: z.literal('OCC'),
    nr1: digits,
    nr2: digits,
    nr3: digits,
  })
  .strict();
// A card UID read over NFC is NOT automatically a ChipNumber; the value must be
// confirmed by the user before it is used here.
export const chipNumberTicketSchema = z
  .object({ format: z.literal('ChipNumber'), nr2: digits })
  .strict();

export const ticketInputSchema = z.discriminatedUnion('format', [
  skidataTicketSchema,
  occTicketSchema,
  chipNumberTicketSchema,
]);
export type TicketInput = z.infer<typeof ticketInputSchema>;
export type TicketFormat = TicketInput['format'];

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// A registration is only ever built from an explicit user action:
// `confirmedByUser` must be literally true.
export const ticketRegistrationSchema = z
  .object({
    ticket: ticketInputSchema,
    resortId: resortIdSchema,
    date: localDate,
    forceTicketCreation: z.boolean().default(false),
    contractIds: z.array(z.string().min(1).max(64)).max(50).default([]),
    confirmedByUser: z.literal(true),
  })
  .strict();
export type TicketRegistration = z.infer<typeof ticketRegistrationSchema>;

// Canonical key to detect duplicate tickets without exposing the number.
export function ticketKey(ticket: TicketInput): string {
  switch (ticket.format) {
    case 'Skidata':
      return `Skidata:${ticket.nr1}-${ticket.nr2}-${ticket.nr3}-${ticket.nr4}`;
    case 'OCC':
      return `OCC:${ticket.nr1}-${ticket.nr2}-${ticket.nr3}`;
    case 'ChipNumber':
      return `ChipNumber:${ticket.nr2}`;
  }
}

// Safe for other group members: format plus last four digits only.
export function maskedTicketLabel(ticket: TicketInput): string {
  const last = ticketKey(ticket).replace(/\D/g, '').slice(-4);
  return `${ticket.format} ••••${last}`;
}
