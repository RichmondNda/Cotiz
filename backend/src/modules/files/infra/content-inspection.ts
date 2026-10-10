import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

/** Résultat de l'inspection : contenu à conserver (images réencodées sans métadonnées) et son extension. */
export type Inspection = { ok: true; content: Buffer; extension: string } | { ok: false };

/** Type réel attendu pour chaque type déclaré accepté au dépôt (@cotiz/contracts : UPLOAD_MIME_TYPES). */
const EXPECTED: Readonly<Record<string, { detected: string | null; extension: string }>> = {
  'application/pdf': { detected: 'application/pdf', extension: 'pdf' },
  'image/jpeg': { detected: 'image/jpeg', extension: 'jpg' },
  'image/png': { detected: 'image/png', extension: 'png' },
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
    detected: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
  },
  // Le CSV n'a pas d'octets magiques : rien de détecté, et du texte seulement.
  'text/csv': { detected: null, extension: 'csv' },
};

/** Au-delà, une image est refusée (bombe de décompression) : 25 Mpx, largement assez pour une photo de reçu. */
const MAX_PIXELS = 25_000_000;

/** Texte : aucun caractère de contrôle hors tabulation et fins de ligne (quel que soit l'encodage, UTF-8 ou CP1252). */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

/**
 * Vérifie le contenu réel par ses octets magiques (file-type) contre le type déclaré, et nettoie les images :
 * réencodées sans aucune métadonnée (EXIF, GPS…), orientation appliquée. Tout écart est un refus.
 */
export async function inspectContent(content: Buffer, declaredMime: string): Promise<Inspection> {
  const expected = EXPECTED[declaredMime];
  if (!expected) return { ok: false };
  const detected = (await fileTypeFromBuffer(content))?.mime ?? null;
  if (detected !== expected.detected) return { ok: false };
  if (declaredMime === 'text/csv') {
    return CONTROL.test(content.toString('latin1')) ? { ok: false } : { ok: true, content, extension: 'csv' };
  }
  if (declaredMime === 'image/jpeg' || declaredMime === 'image/png') {
    try {
      const image = sharp(content, { failOn: 'error', limitInputPixels: MAX_PIXELS }).rotate();
      const cleaned = await (declaredMime === 'image/jpeg' ? image.jpeg({ quality: 90 }) : image.png()).toBuffer();
      return { ok: true, content: cleaned, extension: expected.extension };
    } catch {
      return { ok: false };
    }
  }
  return { ok: true, content, extension: expected.extension };
}

/** Miniature WebP (320 px au plus) d'une image ; `null` pour les autres types. */
export async function thumbnail(content: Buffer, mimeType: string): Promise<Buffer | null> {
  if (mimeType !== 'image/jpeg' && mimeType !== 'image/png') return null;
  return sharp(content, { limitInputPixels: MAX_PIXELS })
    .resize(320, 320, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 70 })
    .toBuffer();
}
