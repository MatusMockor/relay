const APP_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

const documentOf = (url: string): string | null => {
  if (!URL.canParse(url)) {
    return null;
  }
  const parsed = new URL(url);
  if (!APP_PROTOCOLS.has(parsed.protocol)) {
    return null;
  }
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
};

export const createAppDocumentPredicate = (
  rendererUrl: string | null,
  rendererFileUrl: string,
): ((url: string) => boolean) => {
  const documents = new Set(
    [rendererUrl, rendererFileUrl]
      .map((url) => (url === null ? null : documentOf(url)))
      .filter((document) => document !== null),
  );
  return (url) => {
    const target = documentOf(url);
    return target !== null && documents.has(target);
  };
};
