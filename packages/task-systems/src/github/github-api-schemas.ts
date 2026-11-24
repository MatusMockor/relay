import { z } from 'zod';

const text = (max: number) => z.string().max(max);

export const GitHubUserSchema = z.object({
  id: z.number().int().nonnegative(),
  login: z.string().min(1).max(100),
  name: text(1000).nullish(),
});
export type GitHubUser = z.infer<typeof GitHubUserSchema>;

const GitHubLabelSchema = z.union([text(1000), z.object({ name: text(1000).nullish() })]);

export const GitHubIssueSchema = z.object({
  id: z.number().int().nonnegative(),
  number: z.number().int().positive(),
  title: text(100_000).nullish(),
  html_url: z.url({ protocol: /^https$/ }).max(4096),
  state: text(50).nullish(),
  labels: z.array(GitHubLabelSchema).max(1000).nullish(),
  repository: z.object({ full_name: z.string().min(1).max(200) }).nullish(),
  repository_url: text(4096).nullish(),
  milestone: z.object({ due_on: text(100).nullish() }).nullish(),
  updated_at: text(100).nullish(),
  pull_request: z.unknown().optional(),
});
export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

export const GitHubIssueListSchema = z.array(GitHubIssueSchema).max(1000);
