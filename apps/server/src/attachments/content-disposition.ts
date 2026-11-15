const FALLBACK_NAME = 'attachment';

const asciiFallback = (filename: string): string =>
  filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');

const extendedValue = (filename: string): string =>
  encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export const contentDisposition = (filename: string | null): string => {
  const name = filename === null || filename.trim() === '' ? FALLBACK_NAME : filename;
  return `attachment; filename="${asciiFallback(name)}"; filename*=UTF-8''${extendedValue(name)}`;
};
