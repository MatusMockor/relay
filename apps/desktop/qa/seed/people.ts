import assert from 'node:assert/strict';
import type { SeedAddress } from './seed-message';

export const SENDERS: readonly SeedAddress[] = [
  { name: 'Jana Kováčová', address: 'jana.kovacova@firma.sk' },
  { name: 'Peter Horváth', address: 'peter.horvath@firma.sk' },
  { name: 'Lucia Šimková', address: 'lucia.simkova@dodavatel.sk' },
  { name: 'Marek Novák', address: 'marek.novak@klient.cz' },
  { name: 'Zuzana Bieliková', address: 'zuzana.bielikova@firma.sk' },
  { name: 'Tomáš Varga', address: 'tomas.varga@partner.eu' },
  { name: 'Eva Molnárová', address: 'eva.molnarova@uctovnictvo.sk' },
  { name: 'Ondrej Baláž', address: 'ondrej.balaz@firma.sk' },
];

export const ownerAddress = (email: string): SeedAddress => ({ name: 'QA Relay', address: email });

export const senderAt = (index: number): SeedAddress => {
  const sender = SENDERS[index % SENDERS.length];
  assert.ok(sender, 'The sender list is empty');
  return sender;
};
