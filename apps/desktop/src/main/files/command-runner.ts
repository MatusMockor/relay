export type CommandRunner = (file: string, args: readonly string[]) => Promise<void>;
