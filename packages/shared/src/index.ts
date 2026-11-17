import { z } from 'zod';

export const emailSchema = z
  .email()
  .max(254)
  .transform((value) => value.trim().toLowerCase());
export const requestCodeSchema = z
  .object({ email: z.string().trim().pipe(emailSchema) })
  .strict();
export const verifyCodeSchema = z
  .object({ challengeId: z.uuid(), code: z.string().regex(/^\d{8}$/) })
  .strict();
export const googleVerifySchema = z
  .object({
    challengeId: z.uuid(),
    idToken: z.string().min(1).max(12000),
  })
  .strict();
export const profileUpdateSchema = z
  .object({ displayName: z.string().trim().min(1).max(60) })
  .strict();
export const userSchema = z.object({
  id: z.uuid(),
  email: emailSchema,
  displayName: z.string(),
  sessionExpiresAt: z.iso.datetime(),
});
export type AppUser = z.infer<typeof userSchema>;
export const authStatusSchema = z.object({
  skiline: z.literal('unavailable'),
  google: z.boolean().default(false),
  appEmailCode: z.boolean(),
  localTestMode: z.boolean(),
});
export type AuthStatus = z.infer<typeof authStatusSchema>;
export const challengeSchema = z.object({
  challengeId: z.uuid(),
  expiresIn: z.number().int(),
  message: z.string(),
});
