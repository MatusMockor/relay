import { useState } from 'react';

const isQuoted = (line: string): boolean => line.startsWith('>');

const paragraphsOf = (text: string, quoted: boolean): string[][] =>
  text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split('\n')
        .filter((line) => isQuoted(line) === quoted)
        .map((line) => (quoted ? line.replace(/^(?:>\s?)+/, '') : line)),
    )
    .filter((lines) => lines.length > 0 && lines.some((line) => line.trim() !== ''));

function Paragraphs({ paragraphs }: { readonly paragraphs: readonly string[][] }) {
  return paragraphs.map((lines, index) => (
    <p key={index}>
      {lines.map((line, lineIndex) => (
        <span key={lineIndex}>
          {lineIndex > 0 ? <br /> : null}
          {line}
        </span>
      ))}
    </p>
  ));
}

export function TextBody({ text }: { readonly text: string }) {
  const own = paragraphsOf(text, false);
  const quoted = paragraphsOf(text, true);
  const [showQuoted, setShowQuoted] = useState(false);
  const expanded = showQuoted || own.length === 0;
  return (
    <div className="txt">
      <Paragraphs paragraphs={own} />
      {quoted.length > 0 && own.length > 0 ? (
        <div className="img-note">
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => {
              setShowQuoted((value) => !value);
            }}
          >
            {expanded ? 'Skryť citovaný text' : 'Zobraziť citovaný text'}
          </button>
        </div>
      ) : null}
      {quoted.length > 0 && expanded ? (
        <blockquote>
          <Paragraphs paragraphs={quoted} />
        </blockquote>
      ) : null}
    </div>
  );
}
