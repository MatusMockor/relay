import { describe, expect, it } from 'vitest';
import { canOpenAttachmentExternally, safeAttachmentFilename } from '../src/domain';

describe('opening attachments in the system default app', () => {
  it('judges the name the file will really get on disk', () => {
    expect(canOpenAttachmentExternally('report.pdf')).toBe(true);
    expect(canOpenAttachmentExternally('report.pdf ')).toBe(true);
    expect(canOpenAttachmentExternally('report.pdf.')).toBe(true);
    expect(canOpenAttachmentExternally('.pdf')).toBe(false);
    expect(safeAttachmentFilename('.pdf')).toBe('pdf');
    expect(safeAttachmentFilename('report.pdf ')).toBe('report.pdf');
  });

  it('allows only known document types', () => {
    expect(
      ['Tabuľka.XLSX', 'pozvanka.ics', 'archiv.zip', 'kontakt.vcf'].map(
        canOpenAttachmentExternally,
      ),
    ).toEqual([true, true, true, true]);
    expect(
      ['a.hta', 'a.command', 'a.exe', 'a.lnk', 'a.docm', 'bez-pripony', 'a.pdf.command'].map(
        canOpenAttachmentExternally,
      ),
    ).toEqual([false, false, false, false, false, false, false]);
  });

  it('cleans names into one safe file name', () => {
    expect(safeAttachmentFilename('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(safeAttachmentFilename('..')).toBe('priloha');
    const long = safeAttachmentFilename(`${'ľ'.repeat(200)}.pdf`);
    expect(long.endsWith('.pdf')).toBe(true);
    expect(new TextEncoder().encode(long).length).toBeLessThanOrEqual(200);
  });
});
