const paragraphsOf = (text: string): string[][] =>
  text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.split('\n').filter((line) => !line.startsWith('>')))
    .filter((lines) => lines.length > 0 && lines.some((line) => line.trim() !== ''));

export function TextBody({ text }: { readonly text: string }) {
  return (
    <div className="txt">
      {paragraphsOf(text).map((lines, index) => (
        <p key={index}>
          {lines.map((line, lineIndex) => (
            <span key={lineIndex}>
              {lineIndex > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </p>
      ))}
    </div>
  );
}
