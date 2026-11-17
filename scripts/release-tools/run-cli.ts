import { FeedError } from './feed-error.ts';

export type CliMain = (args: string[]) => Promise<number>;

export const runCli = async (main: CliMain): Promise<void> => {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    if (!(error instanceof FeedError)) {
      throw error;
    }
    console.error(error.message);
    process.exitCode = 1;
  }
};

export const reportProblems = (problems: readonly string[]): number => {
  problems.forEach((problem) => {
    console.error(problem);
  });
  return problems.length === 0 ? 0 : 1;
};
