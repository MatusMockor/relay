import type { RemoteExternalTask } from '@relay/engine';
import { clip, clipOrNull } from '../shared/text';
import { isoTimestampOf } from '../shared/timestamp';
import type { LinearIssue } from './linear-api-schemas';
import { linearPriorityOf } from './linear-priority';
import { linearStatusCategoryOf } from './linear-status';

export const toRemoteTask = (issue: LinearIssue): RemoteExternalTask => ({
  externalId: issue.id,
  key: issue.identifier,
  title: clip(issue.title, 1000),
  url: issue.url,
  status: {
    name: clip(issue.state?.name, 255),
    category: linearStatusCategoryOf(issue.state?.type),
  },
  priority: linearPriorityOf(issue.priority),
  projectName: clipOrNull(issue.project?.name, 255) ?? clipOrNull(issue.team?.name, 255),
  dueDate: issue.dueDate ?? null,
  updatedAt: isoTimestampOf(issue.updatedAt),
});
