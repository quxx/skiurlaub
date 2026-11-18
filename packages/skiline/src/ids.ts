import { z } from 'zod';

// The observed Skiline data uses several different identifiers. They are
// distinct types so that, for example, a numeric ticket id can never be passed
// where a resort id is expected. None of the example values seen in the wild
// (such as 334 for the Zillertal Arena or 141 for Hochkrimml) are constants.
declare const brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [brand]: B };

export type NumericTicketId = Brand<string, 'NumericTicketId'>;
export type TicketUuid = Brand<string, 'TicketUuid'>;
export type UserTicketUuid = Brand<string, 'UserTicketUuid'>;
export type ResortId = Brand<string, 'ResortId'>;
export type SubResortId = Brand<string, 'SubResortId'>;
export type SkiingDayId = Brand<string, 'SkiingDayId'>;

// External ids arrive as numbers or strings; they are kept as bounded strings.
export const externalIdSchema = z
  .union([
    z.string().trim().min(1).max(64),
    z.number().int().nonnegative().safe(),
  ])
  .transform((value) => String(value));

const uuid = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

export const numericTicketIdSchema = externalIdSchema.transform(
  (value) => value as NumericTicketId,
);
export const ticketUuidSchema = uuid.transform((value) => value as TicketUuid);
export const userTicketUuidSchema = uuid.transform(
  (value) => value as UserTicketUuid,
);
export const resortIdSchema = externalIdSchema.transform(
  (value) => value as ResortId,
);
export const subResortIdSchema = externalIdSchema.transform(
  (value) => value as SubResortId,
);
export const skiingDayIdSchema = externalIdSchema.transform(
  (value) => value as SkiingDayId,
);
