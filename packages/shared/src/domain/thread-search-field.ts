import { z } from 'zod';

export const ThreadSearchFieldSchema = z.enum(['from', 'subject']);
export type ThreadSearchField = z.infer<typeof ThreadSearchFieldSchema>;
