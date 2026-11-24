import { z } from 'zod';

const text = (max: number) => z.string().max(max);

export const JiraMyselfSchema = z.object({
  accountId: z.string().min(1).max(128),
  displayName: text(1000).optional(),
  emailAddress: text(320).optional(),
});
export type JiraMyself = z.infer<typeof JiraMyselfSchema>;

export const JiraIssueSchema = z.object({
  id: z.string().min(1).max(255),
  key: z.string().min(1).max(100),
  fields: z.object({
    summary: text(100_000).nullish(),
    status: z
      .object({
        name: text(1000).nullish(),
        statusCategory: z.object({ key: text(100).nullish() }).nullish(),
      })
      .nullish(),
    priority: z.object({ name: text(1000).nullish() }).nullish(),
    project: z.object({ key: text(255).nullish(), name: text(1000).nullish() }).nullish(),
    duedate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullish()
      .catch(null),
    updated: text(100).nullish(),
  }),
});
export type JiraIssue = z.infer<typeof JiraIssueSchema>;

export const JiraSearchPageSchema = z.object({
  issues: z.array(JiraIssueSchema).max(5000),
  nextPageToken: z.string().min(1).max(10_000).nullish(),
  isLast: z.boolean().optional(),
});
export type JiraSearchPage = z.infer<typeof JiraSearchPageSchema>;
