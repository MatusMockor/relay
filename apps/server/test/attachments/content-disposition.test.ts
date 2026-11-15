import { describe, expect, it } from 'vitest';
import { contentDisposition } from '../../src/attachments/content-disposition';

describe('contentDisposition', () => {
  it('percent-encodes characters the extended filename grammar does not allow', () => {
    expect(contentDisposition("résumé (1)*'v2'.pdf")).toBe(
      `attachment; filename="r_sum_ (1)*'v2'.pdf"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%281%29%2A%27v2%27.pdf`,
    );
  });

  it('falls back to a generic name', () => {
    expect(contentDisposition('  ')).toBe(
      `attachment; filename="attachment"; filename*=UTF-8''attachment`,
    );
  });
});
