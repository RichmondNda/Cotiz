import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/** Fichier joint au document HTML envoyé au moteur de rendu (Gotenberg : même répertoire que index.html). */
export interface PdfAsset {
  name: string;
  content: Uint8Array;
}

/** Polices de la charte (architecture/08) : Poppins pour les titres, Inter pour le texte, sous-ensemble latin. */
export const FONTS = [
  { family: 'Poppins', weight: 600, file: '@fontsource/poppins/files/poppins-latin-600-normal.woff2' },
  { family: 'Poppins', weight: 700, file: '@fontsource/poppins/files/poppins-latin-700-normal.woff2' },
  { family: 'Inter', weight: 400, file: '@fontsource/inter/files/inter-latin-400-normal.woff2' },
  { family: 'Inter', weight: 600, file: '@fontsource/inter/files/inter-latin-600-normal.woff2' },
] as const;

const require = createRequire(import.meta.url);
let cache: PdfAsset[] | undefined;

/** Fichiers des polices, embarqués avec chaque document (aucune ressource externe, règle 6 du dépôt). */
export function fontAssets(): PdfAsset[] {
  cache ??= FONTS.map((font) => ({
    name: font.file.slice(font.file.lastIndexOf('/') + 1),
    content: new Uint8Array(readFileSync(require.resolve(font.file))),
  }));
  return cache;
}

/** Déclarations `@font-face` des polices jointes. */
export function fontFaces(): string {
  return FONTS.map(
    (font) =>
      `@font-face{font-family:'${font.family}';font-weight:${String(font.weight)};font-style:normal;` +
      `src:url('${font.file.slice(font.file.lastIndexOf('/') + 1)}') format('woff2');}`,
  ).join('\n');
}
