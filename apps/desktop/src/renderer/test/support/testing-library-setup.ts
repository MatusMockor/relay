if (typeof document !== 'undefined') {
  const { configure } = await import('@testing-library/react');
  const { installListGeometry } = await import('./list-geometry');
  configure({ asyncUtilTimeout: 5_000 });
  installListGeometry();
}
