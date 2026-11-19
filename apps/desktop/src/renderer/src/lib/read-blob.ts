const read = <T>(start: (reader: FileReader) => void, result: (value: unknown) => T) =>
  new Promise<T>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(result(reader.result));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('Súbor sa nepodarilo prečítať'));
    };
    start(reader);
  });

export const readBlobBytes = (blob: Blob): Promise<Uint8Array<ArrayBuffer>> =>
  read(
    (reader) => {
      reader.readAsArrayBuffer(blob);
    },
    (value) => new Uint8Array(value instanceof ArrayBuffer ? value : new ArrayBuffer(0)),
  );

export const readBlobText = (blob: Blob): Promise<string> =>
  read(
    (reader) => {
      reader.readAsText(blob);
    },
    (value) => (typeof value === 'string' ? value : ''),
  );
