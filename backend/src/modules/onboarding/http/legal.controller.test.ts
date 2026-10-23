import { generateKeyPairSync } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { LegalPage } from '@cotiz/contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../../app.js';
import { loadConfig } from '../../../config.js';

/**
 * Lot 1.3 · étape 3 : pub.legal, textes versionnés en Markdown (backend/content/legal/), sans base ni Redis.
 * Vérification de l'étape : réponse conforme au contrat.
 */

const jwt = generateKeyPairSync('ed25519');
let app: INestApplication;
let base: string;

beforeAll(async () => {
  app = await createApp(
    loadConfig({
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://cotiz:cotiz@127.0.0.1:1/cotiz',
      REDIS_URL: 'redis://127.0.0.1:1',
      S3_ENDPOINT: 'http://127.0.0.1:1',
      JWT_PRIVATE_KEY: jwt.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
      JWT_PUBLIC_KEY: jwt.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    }),
    { logger: false },
  );
  await app.listen(0, '127.0.0.1');
  base = `${await app.getUrl()}/api/v1`;
});

afterAll(async () => {
  await app.close();
});

const headings = (markdown: string) => [...markdown.matchAll(/^## (.+)$/gm)].map((m) => m[1]);

describe('pub.legal : pages légales en Markdown versionné', () => {
  it.each([
    [
      'cgu',
      'Conditions générales d’utilisation',
      [
        'Objet',
        'Accès au service',
        'Comptes et identifiants',
        'Paiements entre membres et associations',
        'Abonnements',
        'Responsabilités',
        'Résiliation',
        'Droit applicable',
      ],
    ],
    [
      'confidentialite',
      'Politique de confidentialité',
      [
        'Données collectées',
        'Finalités',
        'Durée de conservation',
        'Destinataires',
        'Sécurité',
        'Vos droits',
        'Contact',
      ],
    ],
    [
      'mentions',
      'Mentions légales',
      ['Éditeur', 'Directeur de la publication', 'Hébergement', 'Propriété intellectuelle', 'Contact'],
    ],
  ])('%s : titre, version, date et sections de la maquette', async (slug, title, sections) => {
    const res = await fetch(`${base}/public/legal/${slug}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const page = LegalPage.parse(await res.json());
    expect(page).toMatchObject({ slug, title });
    expect(page.version).toMatch(/^\d+\.\d+$/);
    expect(headings(page.markdown)).toEqual(sections);
    // Le titre est servi à part : le texte commence par la première section, sans en-tête de métadonnées.
    expect(page.markdown.trimStart().startsWith('## ')).toBe(true);
  });

  it('page inconnue : 404 not_found (pas 422 : l’adresse n’existe simplement pas)', async () => {
    for (const slug of ['inconnue', 'CGU', '..%2Fcgu']) {
      const res = await fetch(`${base}/public/legal/${slug}`);
      expect(res.status, slug).toBe(404);
      expect(((await res.json()) as { code: string }).code).toBe('not_found');
    }
  });
});
