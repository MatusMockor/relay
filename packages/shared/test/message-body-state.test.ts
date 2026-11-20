import { describe, expect, it } from 'vitest';
import { isBodyLocal, MessageBodyStateSchema } from '../src/domain';

describe('message body state', () => {
  it('treats a missing body state as local and only remote as not local', () => {
    expect(isBodyLocal({})).toBe(true);
    expect(isBodyLocal({ bodyState: 'local' })).toBe(true);
    expect(isBodyLocal({ bodyState: 'remote' })).toBe(false);
    expect(MessageBodyStateSchema.safeParse('partial').success).toBe(false);
  });
});
