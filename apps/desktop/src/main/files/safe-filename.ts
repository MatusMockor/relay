const FALLBACK_NAME = 'priloha';
const MAX_BYTES = 200;
const UNSAFE_CHARACTERS = /[/\\:*?"<>|\p{Cc}]/gu;
const EDGE_DOTS_AND_SPACES = /^[.\s]+|[.\s]+$/g;
const EXTENSION = /\.[\p{L}\p{N}]{1,10}$/u;

const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8');

const truncate = (name: string): string => {
  if (byteLength(name) <= MAX_BYTES) {
    return name;
  }
  const extension = EXTENSION.exec(name)?.[0] ?? '';
  const characters = Array.from(name.slice(0, name.length - extension.length));
  while (characters.length > 0 && byteLength(characters.join('') + extension) > MAX_BYTES) {
    characters.pop();
  }
  return characters.join('') + extension;
};

export const safeFilename = (filename: string): string => {
  const cleaned = filename
    .normalize('NFC')
    .replace(UNSAFE_CHARACTERS, '_')
    .replace(EDGE_DOTS_AND_SPACES, '');
  const truncated = truncate(cleaned).replace(EDGE_DOTS_AND_SPACES, '');
  return truncated === '' ? FALLBACK_NAME : truncated;
};
