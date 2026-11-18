import { z } from 'zod';

export const JiraEventKindSchema = z.enum(['mention', 'assigned', 'comment', 'status', 'other']);
export type JiraEventKind = z.infer<typeof JiraEventKindSchema>;

export const JiraTaskEventsSchema = z
  .array(JiraEventKindSchema)
  .refine((kinds) => new Set(kinds).size === kinds.length, {
    message: 'Jira event kinds must be unique',
  });
