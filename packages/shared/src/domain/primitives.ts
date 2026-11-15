import { z } from 'zod';

export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;

export const EmailAddressSchema = z.email().max(320);
export type EmailAddress = z.infer<typeof EmailAddressSchema>;

export const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);
export type HexColor = z.infer<typeof HexColorSchema>;

export const JiraKeySchema = z.string().regex(/^[A-Z][A-Z0-9_]+-\d+$/);
export type JiraKey = z.infer<typeof JiraKeySchema>;
