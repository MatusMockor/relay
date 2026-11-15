const NEWLINE = 0x0a;

export class LineFramer {
  private pending: Buffer[] = [];
  private pendingBytes = 0;

  constructor(private readonly maxFrameBytes: number) {}

  push(chunk: Buffer): string[] | null {
    const lines: string[] = [];
    let start = 0;
    for (;;) {
      const newline = chunk.indexOf(NEWLINE, start);
      if (newline < 0) {
        break;
      }
      const part = chunk.subarray(start, newline);
      if (this.pendingBytes + part.length > this.maxFrameBytes) {
        return null;
      }
      lines.push(this.take(part));
      start = newline + 1;
    }
    const rest = chunk.subarray(start);
    this.pendingBytes += rest.length;
    if (this.pendingBytes > this.maxFrameBytes) {
      return null;
    }
    this.pending.push(rest);
    return lines;
  }

  private take(part: Buffer): string {
    const frame = Buffer.concat([...this.pending, part]).toString('utf8');
    this.pending = [];
    this.pendingBytes = 0;
    return frame.endsWith('\r') ? frame.slice(0, -1) : frame;
  }
}
