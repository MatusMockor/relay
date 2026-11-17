export const modelArgs = (model: string | null): string[] =>
  model === null ? [] : ['--model', model];
