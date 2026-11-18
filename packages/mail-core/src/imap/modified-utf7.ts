const SHIFTED = /&([A-Za-z0-9+,]*)-/g;

const decodeShift = (encoded: string): string => {
  if (encoded === '') {
    return '&';
  }
  const bytes = Buffer.from(encoded.replace(/,/g, '/'), 'base64');
  const units: number[] = [];
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    units.push(bytes.readUInt16BE(index));
  }
  return String.fromCharCode(...units);
};

export const decodeModifiedUtf7 = (value: string): string =>
  value.replace(SHIFTED, (_match, encoded: string) => decodeShift(encoded));
