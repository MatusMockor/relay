export interface TaskPaging {
  readonly pageSize: number;
  readonly maxIssues: number;
}

export const DEFAULT_TASK_PAGING: TaskPaging = { pageSize: 100, maxIssues: 300 };
