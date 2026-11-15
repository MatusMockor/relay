export interface UntrustedMarkers {
  readonly open: string;
  readonly close: string;
}

export function untrustedMarkers(nonce: string): UntrustedMarkers {
  return { open: `<<<UNTRUSTED_${nonce}>>>`, close: `<<<END_UNTRUSTED_${nonce}>>>` };
}

export function wrapUntrusted(content: string, nonce: string): string {
  const markers = untrustedMarkers(nonce);
  const sanitized = content.split(nonce).join('[removed]');
  return `${markers.open}\n${sanitized}\n${markers.close}`;
}
