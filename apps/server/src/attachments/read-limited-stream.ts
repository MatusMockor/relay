import { Readable } from 'node:stream';
import { ApiException } from '../http/api-exception';

export class UploadTooLargeException extends ApiException {
  constructor() {
    super('validation_failed', 'Súbor je väčší ako 25 MB');
  }
}

const declaredLength = (header: string | undefined): number | null => {
  if (header === undefined || !/^\d+$/.test(header)) {
    return null;
  }
  return Number(header);
};

const collect = (body: Readable, limit: number): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const cleanup = () => {
      body.off('data', onData);
      body.off('end', onEnd);
      body.off('error', onError);
      body.off('close', onClose);
    };
    const fail = (error: Error) => {
      cleanup();
      chunks.length = 0;
      body.pause();
      reject(error);
    };
    function onData(chunk: Buffer | Uint8Array) {
      total += chunk.byteLength;
      if (total > limit) {
        fail(new UploadTooLargeException());
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    function onEnd() {
      cleanup();
      resolve(new Uint8Array(Buffer.concat(chunks, total)));
    }
    function onError(error: Error) {
      fail(error);
    }
    function onClose() {
      fail(new ApiException('validation_failed', 'Nahrávanie súboru sa prerušilo'));
    }
    body.on('data', onData);
    body.once('end', onEnd);
    body.once('error', onError);
    body.once('close', onClose);
  });

export const readLimitedStream = async (
  body: unknown,
  contentLength: string | undefined,
  limit: number,
): Promise<Uint8Array> => {
  if (!(body instanceof Readable) || body.destroyed || body.readableEnded) {
    throw new ApiException('validation_failed', 'Chýba obsah súboru');
  }
  const declared = declaredLength(contentLength);
  if (declared !== null && declared > limit) {
    throw new UploadTooLargeException();
  }
  return collect(body, limit);
};
