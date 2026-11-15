import { Fragment } from 'react';
import { foldText } from '../../lib/text';

export const highlightRanges = (text: string, query: string): boolean[] => {
  const needle = foldText(query.trim());
  const chars = Array.from(text);
  const marks = chars.map(() => false);
  if (needle === '') {
    return marks;
  }
  const owners: number[] = [];
  const hay = chars
    .map((char, index) => {
      const folded = foldText(char);
      for (let unit = 0; unit < folded.length; unit += 1) {
        owners.push(index);
      }
      return folded;
    })
    .join('');
  let at = hay.indexOf(needle);
  while (at !== -1) {
    for (let k = at; k < at + needle.length; k += 1) {
      const owner = owners[k];
      if (owner !== undefined) {
        marks[owner] = true;
      }
    }
    at = hay.indexOf(needle, at + needle.length);
  }
  return marks;
};

export function Highlight({ text, query }: { readonly text: string; readonly query: string }) {
  const marks = highlightRanges(text, query);
  if (!marks.includes(true)) {
    return <>{text}</>;
  }
  const chars = Array.from(text);
  const parts: { text: string; mark: boolean }[] = [];
  chars.forEach((char, index) => {
    const mark = marks[index] ?? false;
    const last = parts.at(-1);
    if (last?.mark === mark) {
      last.text += char;
      return;
    }
    parts.push({ text: char, mark });
  });
  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>{part.mark ? <mark>{part.text}</mark> : part.text}</Fragment>
      ))}
    </>
  );
}
