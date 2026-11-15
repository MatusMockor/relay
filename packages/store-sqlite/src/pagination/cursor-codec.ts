import { ValidationError } from '@relay/engine';
import type { z } from 'zod';

export class CursorCodec<Position> {
  constructor(private readonly schema: z.ZodType<Position>) {}

  encode(position: Position): string {
    return Buffer.from(JSON.stringify(position), 'utf8').toString('base64url');
  }

  decode(cursor: string | null): Position | null {
    if (cursor === null) {
      return null;
    }
    const parsed = this.schema.safeParse(this.parseJson(cursor));
    if (!parsed.success) {
      throw new ValidationError('Invalid pagination cursor');
    }
    return parsed.data;
  }

  private parseJson(cursor: string): unknown {
    try {
      const decoded: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
      return decoded;
    } catch (error) {
      throw new ValidationError('Invalid pagination cursor', { cause: error });
    }
  }
}
