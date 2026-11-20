import type { MessageStructureObject } from 'imapflow';

export const MAX_PREVIEW_PART_BYTES = 1024 * 1024;

export interface PreviewPart {
  readonly part: string;
  readonly type: 'text/plain' | 'text/html';
  readonly encoding: string;
  readonly charset: string;
  readonly size: number;
  readonly flowed: boolean;
  readonly delSp: boolean;
}

const parameterIs = (value: string | undefined, expected: string): boolean =>
  (value ?? '').trim().toLowerCase() === expected;

export const toPreviewPart = (
  node: MessageStructureObject,
  type: PreviewPart['type'],
): PreviewPart => {
  const flowed = parameterIs(node.parameters?.format, 'flowed');
  return {
    part: node.part ?? 'TEXT',
    type,
    encoding: (node.encoding ?? '7bit').toLowerCase(),
    charset: node.parameters?.charset ?? 'utf-8',
    size: node.size ?? 0,
    flowed,
    delSp: flowed && parameterIs(node.parameters?.delsp, 'yes'),
  };
};

const withinPreviewLimit = (part: PreviewPart | undefined): PreviewPart | null =>
  part === undefined || part.size > MAX_PREVIEW_PART_BYTES ? null : part;

export const choosePreview = (
  plain: readonly PreviewPart[],
  html: readonly PreviewPart[],
): PreviewPart | null => withinPreviewLimit(plain[0]) ?? withinPreviewLimit(html[0]);
