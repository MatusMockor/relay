import { isUnsafeRegex } from './regex-safety';

export class RegexCache {
  private readonly compiled = new Map<string, RegExp | null>();

  get(pattern: string, flags: string): RegExp | null {
    const key = `${flags}/${pattern}`;
    if (this.compiled.has(key)) {
      return this.compiled.get(key) ?? null;
    }
    const regex = this.compile(pattern, flags);
    this.compiled.set(key, regex);
    return regex;
  }

  private compile(pattern: string, flags: string): RegExp | null {
    if (isUnsafeRegex(pattern)) {
      return null;
    }
    try {
      return new RegExp(pattern, flags);
    } catch {
      return null;
    }
  }
}
