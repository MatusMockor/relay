import type { RemoteAttachmentMeta } from '@relay/engine';
import type { MessageStructureObject } from 'imapflow';
import { detectMimeType } from 'nodemailer/lib/mime-funcs/mime-types';
import { choosePreview, toPreviewPart, type PreviewPart } from './preview-part';

export interface SummaryStructure {
  readonly preview: PreviewPart | null;
  readonly attachments: readonly RemoteAttachmentMeta[];
}

interface WalkState {
  readonly plain: PreviewPart[];
  readonly html: PreviewPart[];
  readonly attachments: RemoteAttachmentMeta[];
}

const TEXT_TYPES = new Set(['text/plain', 'text/html', 'message/delivery-status']);
const EMBEDDED_ENCODINGS = new Set(['', '7bit', '8bit', 'binary']);

const nonEmpty = (value: string | undefined): string | null =>
  value === undefined || value === '' ? null : value;

const filenameOf = (node: MessageStructureObject): string | null =>
  nonEmpty(node.dispositionParameters?.filename) ?? nonEmpty(node.parameters?.name);

const isAttachmentLeaf = (node: MessageStructureObject): boolean => {
  const disposition = node.disposition ?? '';
  if (!TEXT_TYPES.has(node.type)) {
    return true;
  }
  return disposition !== '' && disposition !== 'inline';
};

const isEmbeddedMessage = (node: MessageStructureObject): boolean =>
  node.type === 'message/rfc822' &&
  node.disposition === 'inline' &&
  EMBEDDED_ENCODINGS.has(node.encoding ?? '') &&
  node.childNodes !== undefined;

const contentTypeOf = (node: MessageStructureObject, filename: string | null): string => {
  if (node.type !== 'application/octet-stream' || filename === null) {
    return node.type || 'application/octet-stream';
  }
  return detectMimeType(filename) || 'application/octet-stream';
};

const decodedSize = (node: MessageStructureObject): number => {
  const size = node.size ?? 0;
  return node.encoding === 'base64' ? Math.floor((size * 3) / 4) : size;
};

const contentIdOf = (node: MessageStructureObject): string | null =>
  node.id === undefined ? null : node.id.trim().replace(/^<|>$/g, '').trim();

const toAttachment = (node: MessageStructureObject, related: boolean): RemoteAttachmentMeta => {
  const filename = filenameOf(node);
  const contentType = contentTypeOf(node, filename);
  const contentId = contentIdOf(node);
  const calendarBody =
    contentType === 'text/calendar' && filename === null && node.disposition !== 'attachment';
  return {
    filename,
    contentType,
    size: decodedSize(node),
    contentId,
    inline: node.disposition === 'inline' || (contentId !== null && related) || calendarBody,
  };
};

const visitLeaf = (
  node: MessageStructureObject,
  state: WalkState,
  related: boolean,
  embedded: boolean,
): void => {
  if (isAttachmentLeaf(node)) {
    state.attachments.push(toAttachment(node, related));
    return;
  }
  if (embedded) {
    return;
  }
  if (node.type === 'text/plain') {
    state.plain.push(toPreviewPart(node, 'text/plain'));
  }
  if (node.type === 'text/html') {
    state.html.push(toPreviewPart(node, 'text/html'));
  }
};

const walk = (
  node: MessageStructureObject,
  state: WalkState,
  related: boolean,
  embedded: boolean,
): void => {
  const children = node.childNodes ?? [];
  if (node.type.startsWith('multipart/')) {
    const inRelated = related || node.type === 'multipart/related';
    children.forEach((child) => {
      walk(child, state, inRelated, embedded);
    });
    return;
  }
  if (isEmbeddedMessage(node)) {
    children.forEach((child) => {
      walk(child, state, related, true);
    });
    return;
  }
  visitLeaf(node, state, related, embedded);
};

export const summaryStructure = (structure: MessageStructureObject): SummaryStructure => {
  const state: WalkState = { plain: [], html: [], attachments: [] };
  walk(structure, state, false, false);
  return { preview: choosePreview(state.plain, state.html), attachments: state.attachments };
};
