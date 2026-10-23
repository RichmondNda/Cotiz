import { describe, expect, it } from 'vitest';
import { parseLegalDocument } from './legal-documents.js';

const text = (frontMatter: string, body = '## Objet\n\nTexte.\n') => `---\n${frontMatter}\n---\n\n${body}`;

describe('parseLegalDocument', () => {
  it('en-tête title, version, updatedOn ; le reste est le Markdown', () => {
    expect(parseLegalDocument('cgu', text('title: Conditions générales\nversion: 1.0\nupdatedOn: 2026-10-23'))).toEqual(
      {
        slug: 'cgu',
        title: 'Conditions générales',
        version: '1.0',
        updatedOn: '2026-10-23',
        markdown: '## Objet\n\nTexte.\n',
      },
    );
  });

  it.each([
    ['sans en-tête', '## Objet\n'],
    ['champ manquant', text('title: CGU\nversion: 1.0')],
    ['date invalide', text('title: CGU\nversion: 1.0\nupdatedOn: 23/10/2026')],
    ['version invalide', text('title: CGU\nversion: v1\nupdatedOn: 2026-10-23')],
    ['texte vide', text('title: CGU\nversion: 1.0\nupdatedOn: 2026-10-23', '\n')],
  ])('%s : refusé au démarrage', (_name, content) => {
    expect(() => parseLegalDocument('cgu', content)).toThrow(/cgu/);
  });
});
