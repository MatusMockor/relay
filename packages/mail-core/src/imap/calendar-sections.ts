import type { MessageStructureObject } from 'imapflow';
import { isCalendarPart, MAX_CALENDAR_PART_BYTES } from '../parser/calendar-part-rules';

export interface CalendarSection {
  readonly part: string;
  readonly encoding: string;
  readonly charset: string;
}

const MAX_ENCODED_BYTES = MAX_CALENDAR_PART_BYTES * 3 + 4096;
const MAX_SECTIONS = 10;

const filenameOf = (node: MessageStructureObject): string | null =>
  node.dispositionParameters?.filename ?? node.parameters?.name ?? null;

const isCalendarLeaf = (node: MessageStructureObject): boolean =>
  isCalendarPart(node.type, filenameOf(node)) && (node.size ?? 0) <= MAX_ENCODED_BYTES;

const toSection = (node: MessageStructureObject): CalendarSection => ({
  part: node.part ?? 'TEXT',
  encoding: (node.encoding ?? '7bit').toLowerCase(),
  charset: node.parameters?.charset ?? 'utf-8',
});

const collect = (node: MessageStructureObject, sections: CalendarSection[]): void => {
  if (node.type.toLowerCase() === 'message/rfc822') {
    return;
  }
  if (node.childNodes !== undefined) {
    node.childNodes.forEach((child) => {
      collect(child, sections);
    });
    return;
  }
  if (isCalendarLeaf(node)) {
    sections.push(toSection(node));
  }
};

export const calendarSections = (structure: MessageStructureObject): CalendarSection[] => {
  const sections: CalendarSection[] = [];
  collect(structure, sections);
  return sections.slice(0, MAX_SECTIONS);
};
