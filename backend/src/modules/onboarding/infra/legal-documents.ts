import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { LegalPage, LegalSlug } from '@cotiz/contracts';
import { z } from 'zod';

/** backend/content/legal/ (même profondeur depuis src/ et dist/). */
const CONTENT_DIR = new URL('../../../../content/legal/', import.meta.url);

const FRONT_MATTER = /^---\n([\s\S]*?)\n---\n/;
const Header = z.object({
  title: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+$/),
  updatedOn: z.iso.date(),
});

/**
 * Page légale versionnée : en-tête `title`, `version`, `updatedOn` entre deux lignes `---`, puis le Markdown. Erreur
 * explicite (nom de la page) si le fichier est mal formé : l'api refuse de démarrer plutôt que de servir une page fausse.
 */
export function parseLegalDocument(slug: z.infer<typeof LegalSlug>, content: string): LegalPage {
  const match = FRONT_MATTER.exec(content.replace(/\r\n/g, '\n'));
  if (!match) throw new Error(`pages légales : ${slug}, en-tête absent`);
  const fields = Object.fromEntries(
    (match[1] ?? '').split('\n').map((line) => {
      const at = line.indexOf(':');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
  );
  const header = Header.safeParse(fields);
  if (!header.success) throw new Error(`pages légales : ${slug}, en-tête invalide (${z.prettifyError(header.error)})`);
  const markdown = content.replace(/\r\n/g, '\n').slice(match[0].length).replace(/^\n+/, '');
  if (!markdown.trim()) throw new Error(`pages légales : ${slug}, texte vide`);
  return LegalPage.parse({ slug, ...header.data, markdown });
}

/** pub.legal : les trois pages, lues une fois au démarrage (textes livrés avec le code). */
@Injectable()
export class LegalDocuments {
  private readonly pages = new Map<string, LegalPage>(
    LegalSlug.options.map((slug) => [
      slug,
      parseLegalDocument(slug, readFileSync(new URL(`${slug}.md`, CONTENT_DIR), 'utf8')),
    ]),
  );

  /** `undefined` pour une page inconnue. */
  find(slug: string): LegalPage | undefined {
    return this.pages.get(slug);
  }
}
