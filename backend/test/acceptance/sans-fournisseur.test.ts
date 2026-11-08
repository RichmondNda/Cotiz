import { FEATURE_SPECS, FEATURES } from '@cotiz/contracts';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ConfigSchema } from '../../src/config.js';
import { activeFeatures } from '../../src/shared/features/active-features.js';
import { HOTE_FOURNISSEUR, SDK_FOURNISSEUR, VARIABLE_FOURNISSEUR } from './fournisseurs.js';

/**
 * Lot 3.5, étape 2 · Sans fournisseur (règle 6 du dépôt, architecture/13 « Minimisation ») : avant le groupe 6, aucun
 * canal externe (email, SMS, paiement, captcha hébergé, notifications d'un service tiers, polices Google) n'est
 * configurable, annoncé, installé ni appelé. La boucle complète (`frontend/tests/e2e/parcours.mjs jalon`) passe sur une
 * pile dont l'environnement est contrôlé par `tools/sans-fournisseur.mjs` avec la même liste (`fournisseurs.ts`).
 */

const RACINE = fileURLToPath(new URL('../../../', import.meta.url));

/** Fichiers sous `dossier` (récursif), hors dépendances et sorties de build. */
function fichiers(dossier: string, extensions: RegExp): string[] {
  const ignores = new Set(['node_modules', '.nuxt', '.output', 'dist', '.verif', 'coverage', '.turbo']);
  const out: string[] = [];
  for (const nom of readdirSync(dossier)) {
    if (ignores.has(nom)) continue;
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) out.push(...fichiers(chemin, extensions));
    else if (extensions.test(nom)) out.push(chemin);
  }
  return out;
}

/** Clés d'environnement déclarées dans un fichier compose (`KEY: valeur` ou `- KEY=valeur` sous `environment`). */
function clesCompose(texte: string): string[] {
  return [...texte.matchAll(/^\s+(?:-\s+)?([A-Z][A-Z0-9_]+)\s*[:=]/gm)].map((m) => m[1] ?? '');
}

describe('sans fournisseur externe (lot 3.5, étape 2)', () => {
  it('configuration : aucune variable de canal externe n’est lue par l’api ni le worker', () => {
    const cles = Object.keys(ConfigSchema.shape);
    expect(cles.length).toBeGreaterThan(20);
    expect(cles.filter((cle) => VARIABLE_FOURNISSEUR.test(cle))).toEqual([]);
  });

  it('fonctionnalités : un canal externe n’est jamais annoncé, même livré et compris dans le plan', () => {
    const externes = FEATURES.filter((f) => FEATURE_SPECS[f].externalProvider);
    expect(externes).toEqual(['channel_email', 'channel_sms', 'online_payment']);
    const toutes = activeFeatures({ planFeatures: FEATURES }, FEATURES);
    expect(toutes.filter((f) => externes.includes(f))).toEqual([]);
    expect(toutes.length).toBe(FEATURES.length - externes.length);
  });

  it('piles Docker : aucun fichier compose ne définit de variable de fournisseur', () => {
    const composes = fichiers(join(RACINE, 'infra/compose'), /\.ya?ml$/);
    expect(composes.length).toBeGreaterThan(0);
    const fautes = composes.flatMap((f) =>
      clesCompose(readFileSync(f, 'utf8'))
        .filter((cle) => VARIABLE_FOURNISSEUR.test(cle))
        .map((cle) => `${relative(RACINE, f)} : ${cle}`),
    );
    expect(fautes).toEqual([]);
  });

  it('dépendances : aucun SDK de fournisseur dans les paquets du dépôt', () => {
    const paquets = ['package.json', 'backend/package.json', 'frontend/package.json'].concat(
      readdirSync(join(RACINE, 'packages')).map((p) => `packages/${p}/package.json`),
    );
    const fautes = paquets.flatMap((p) => {
      const json = JSON.parse(readFileSync(join(RACINE, p), 'utf8')) as Record<
        string,
        Record<string, string> | undefined
      >;
      const deps = { ...json.dependencies, ...json.devDependencies, ...json.optionalDependencies };
      return Object.keys(deps)
        .filter((d) => SDK_FOURNISSEUR.test(d))
        .map((d) => `${p} : ${d}`);
    });
    expect(fautes).toEqual([]);
  });

  it('code livré : aucun hôte de fournisseur (polices, captcha, SMS, email, paiement) dans le front ni le back', () => {
    const sources = [
      ...fichiers(join(RACINE, 'frontend/app'), /\.(vue|ts|css|mjs)$/),
      ...fichiers(join(RACINE, 'frontend/server'), /\.(ts|mjs)$/),
      ...fichiers(join(RACINE, 'frontend/public'), /\.(html|css|js|json|webmanifest)$/),
      join(RACINE, 'frontend/nuxt.config.ts'),
      ...fichiers(join(RACINE, 'backend/src'), /\.ts$/).filter((f) => !f.endsWith('.test.ts')),
    ];
    expect(sources.length).toBeGreaterThan(100);
    const fautes = sources
      .filter((f) => HOTE_FOURNISSEUR.test(readFileSync(f, 'utf8')))
      .map((f) => relative(RACINE, f));
    expect(fautes).toEqual([]);
  });
});
