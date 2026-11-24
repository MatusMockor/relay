import { z } from 'zod';

const text = (max: number) => z.string().max(max);

const GraphQlErrorSchema = z.object({
  message: text(10_000).optional().catch(undefined),
  extensions: z
    .object({
      code: text(200).optional().catch(undefined),
      type: text(200).optional().catch(undefined),
    })
    .optional()
    .catch(undefined),
});
export type LinearGraphQlError = z.infer<typeof GraphQlErrorSchema>;

export const LinearEnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(GraphQlErrorSchema).max(100).optional(),
});

export const LinearViewerSchema = z.object({
  viewer: z.object({
    id: z.string().min(1).max(255),
    name: text(1000).nullish(),
    email: text(320).nullish(),
    assignedIssues: z.object({ nodes: z.array(z.object({ id: text(255) })).max(10) }),
  }),
  organization: z.object({
    name: text(1000).nullish(),
    urlKey: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  }),
});
export type LinearViewer = z.infer<typeof LinearViewerSchema>;

export const LinearIssueSchema = z.object({
  id: z.string().min(1).max(255),
  identifier: z.string().min(1).max(100),
  title: text(100_000).nullish(),
  url: z.url({ protocol: /^https$/ }).max(4096),
  priority: z.number().nullish(),
  state: z.object({ name: text(1000).nullish(), type: text(100).nullish() }).nullish(),
  team: z.object({ name: text(1000).nullish() }).nullish(),
  project: z.object({ name: text(1000).nullish() }).nullish(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullish()
    .catch(null),
  updatedAt: text(100).nullish(),
});
export type LinearIssue = z.infer<typeof LinearIssueSchema>;

export const LinearIssuesPageSchema = z.object({
  viewer: z.object({
    assignedIssues: z.object({
      nodes: z.array(LinearIssueSchema).max(1000),
      pageInfo: z.object({
        hasNextPage: z.boolean(),
        endCursor: z.string().min(1).max(10_000).nullish(),
      }),
    }),
  }),
});
export type LinearIssuesPage = z.infer<typeof LinearIssuesPageSchema>;
