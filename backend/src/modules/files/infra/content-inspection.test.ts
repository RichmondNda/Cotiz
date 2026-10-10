import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { inspectContent, thumbnail } from './content-inspection.js';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n');
const CSV = Buffer.from('Prénom;NOM;Tel\nAïcha;Bamba;0712345678\n', 'utf8');

/** JPEG avec EXIF (copyright, orientation), comme une photo de téléphone. */
async function photoWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: '#e85d04' } })
    .jpeg()
    .withMetadata({ orientation: 6, exif: { IFD0: { Copyright: 'Awa', Make: 'Telephone' } } })
    .toBuffer();
}

describe('inspectContent : type réel, contenu nettoyé', () => {
  it('PDF déclaré PDF : accepté tel quel', async () => {
    expect(await inspectContent(PDF, 'application/pdf')).toEqual({ ok: true, content: PDF, extension: 'pdf' });
  });

  it('JPEG : EXIF supprimé, orientation appliquée', async () => {
    const photo = await photoWithExif();
    expect((await sharp(photo).metadata()).exif).toBeDefined();
    const result = await inspectContent(photo, 'image/jpeg');
    if (!result.ok) throw new Error('refusé');
    expect(result.extension).toBe('jpg');
    const meta = await sharp(result.content).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
    expect([meta.width, meta.height]).toEqual([20, 40]);
  });

  it('PNG déclaré PNG : réencodé sans métadonnées', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#000' } })
      .png()
      .withMetadata({ exif: { IFD0: { Copyright: 'x' } } })
      .toBuffer();
    const result = await inspectContent(png, 'image/png');
    expect(result.ok && result.extension).toBe('png');
    if (result.ok) expect((await sharp(result.content).metadata()).exif).toBeUndefined();
  });

  it('CSV : texte sans caractère de contrôle accepté', async () => {
    expect(await inspectContent(CSV, 'text/csv')).toEqual({ ok: true, content: CSV, extension: 'csv' });
  });

  it.each([
    ['un PDF déclaré PNG', PDF, 'image/png'],
    ['un PNG déclaré PDF', Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'), 'application/pdf'],
    ['un exécutable déclaré CSV', Buffer.from('4d5a90000300000004000000ffff0000', 'hex'), 'text/csv'],
    ['un binaire avec NUL déclaré CSV', Buffer.from('a;b\n\0\0\0', 'binary'), 'text/csv'],
    ['du HTML déclaré PDF', Buffer.from('<html><script>alert(1)</script></html>'), 'application/pdf'],
    ['un JPEG tronqué', Buffer.from('ffd8ffe000104a464946', 'hex'), 'image/jpeg'],
  ])('refuse %s', async (_case, content, declared) => {
    expect(await inspectContent(content, declared)).toEqual({ ok: false });
  });

  it('refuse une image démesurée (bombe de décompression)', async () => {
    const huge = await sharp({ create: { width: 10_000, height: 10_000, channels: 3, background: '#fff' } })
      .png({ compressionLevel: 9 })
      .toBuffer();
    expect(huge.length).toBeLessThan(5 * 1024 * 1024);
    expect(await inspectContent(huge, 'image/png')).toEqual({ ok: false });
  });
});

describe('thumbnail', () => {
  it('WebP de 320 px au plus pour une image, rien pour un PDF ou un tableur', async () => {
    const photo = await sharp({ create: { width: 1200, height: 600, channels: 3, background: '#06c' } })
      .jpeg()
      .toBuffer();
    const thumb = await thumbnail(photo, 'image/jpeg');
    expect(thumb).not.toBeNull();
    const meta = await sharp(thumb ?? Buffer.alloc(0)).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 320, 160]);
    expect(await thumbnail(PDF, 'application/pdf')).toBeNull();
  });
});
