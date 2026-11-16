import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readLimitedStream } from '../../src/attachments/read-limited-stream';

describe('readLimitedStream', () => {
  it('collects a stream within the limit', async () => {
    const body = new PassThrough();
    const read = readLimitedStream(body, undefined, 10);
    body.end(Buffer.from('ahoj'));

    await expect(read).resolves.toEqual(new Uint8Array(Buffer.from('ahoj')));
  });

  it('rejects declared and streamed bodies over the limit', async () => {
    await expect(readLimitedStream(new PassThrough(), '11', 10)).rejects.toMatchObject({
      message: 'Súbor je väčší ako 25 MB',
    });
    const body = new PassThrough();
    const read = readLimitedStream(body, undefined, 3);
    body.write(Buffer.from('ahoj'));

    await expect(read).rejects.toMatchObject({ message: 'Súbor je väčší ako 25 MB' });
    expect(body.listenerCount('data')).toBe(0);
  });

  it('rejects destroyed and prematurely closed streams', async () => {
    const destroyed = new PassThrough();
    destroyed.destroy();
    await expect(readLimitedStream(destroyed, undefined, 10)).rejects.toMatchObject({
      message: 'Chýba obsah súboru',
    });
    const body = new PassThrough();
    const read = readLimitedStream(body, undefined, 10);
    body.write(Buffer.from('a'));
    body.destroy();

    await expect(read).rejects.toMatchObject({ message: 'Nahrávanie súboru sa prerušilo' });
  });
});
