#!/usr/bin/env node
// Déploiements Dokploy de Cotiz, configurés par l'API Dokploy :
//   - recette (lot 7.1, étape 2, anticipée) : pile de production, https://cotiz.regisnda.com (docs/runbooks/recette-dokploy.md) ;
//   - dev : pile de développement (mocks, comptes de démonstration au mot de passe secret),
//     https://cotiz.dev.regisnda.com (docs/runbooks/dev-dokploy.md).
//
//   node tools/recette-dokploy.mjs [--cible recette|dev] [--branche backend] [--deployer]
//
// - Clé d'API : DOKPLOY_API_KEY, sinon ~/.config/cotiz-dokploy.key (droits 600). URL : DOKPLOY_URL (http://localhost:3000).
// - Projet « Cotiz » ; environnement et service compose de la cible, créés s'ils manquent.
// - Source : dépôt GitHub public, branche choisie, fichier compose de la cible.
// - Variables (onglet Environment) : les secrets ne sont générés qu'une fois ; ceux déjà présents sont gardés tels quels
//   (en changer un casserait la base, les sessions ou les codes chiffrés). Rien n'est affiché : noms seulement.
// - Dev : mot de passe des comptes de démonstration (COTIZ_DEV_SEED_PASSWORD, à la place du mot de passe public du dépôt)
//   généré une fois, écrit aussi dans ~/.config/cotiz-dev-acces (droits 600) pour être lu par son propriétaire.
// - Domaines : application et stockage public, https Let's Encrypt (DNS *.regisnda.com et *.dev.regisnda.com).
// - --deployer : lance le déploiement (construction des images sur ce serveur, quelques minutes).
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJET = 'Cotiz';
const DEPOT = 'https://github.com/RichmondNda/Cotiz.git';
// Services de push des navigateurs courants (docs/runbooks/web-push.md) : jamais dans le code de l'application.
const SERVICES_PUSH = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];
const FICHIER_ACCES_DEV = join(homedir(), '.config/cotiz-dev-acces');

const CIBLES = {
  recette: {
    environnement: 'production',
    service: 'cotiz-recette',
    compose: './infra/compose/staging.yml',
    domaineApp: 'cotiz.regisnda.com',
    domaineFichiers: 'cotiz-fichiers.regisnda.com',
    secrets: () => ({ ...secretsProduction(), ...secretsVapid() }),
    motDePasseDemo: false,
  },
  dev: {
    environnement: 'dev',
    service: 'cotiz-dev',
    compose: './infra/compose/dev-dokploy.yml',
    domaineApp: 'cotiz.dev.regisnda.com',
    domaineFichiers: 'cotiz-fichiers.dev.regisnda.com',
    secrets: () => secretsVapid(),
    motDePasseDemo: true,
  },
};

const args = process.argv.slice(2);
const opt = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 ? args[i + 1] : defaut;
};
const nomCible = opt('cible', 'recette');
const cible = CIBLES[nomCible];
if (!cible) throw new Error(`cible inconnue : ${nomCible} (recette ou dev)`);
const branche = opt('branche', 'backend');
const deployer = args.includes('--deployer');

const base = `${process.env.DOKPLOY_URL ?? 'http://localhost:3000'}/api`;
const cle = (process.env.DOKPLOY_API_KEY ?? readFileSync(join(homedir(), '.config/cotiz-dokploy.key'), 'utf8')).trim();

async function api(chemin, corps) {
  const r = await fetch(`${base}/${chemin}`, {
    method: corps === undefined ? 'GET' : 'POST',
    headers: { 'x-api-key': cle, 'content-type': 'application/json' },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  // Jamais le corps envoyé (il peut porter les variables) ; la réponse d'erreur seulement, tronquée.
  if (!r.ok) throw new Error(`${chemin} → ${r.status} ${texte.slice(0, 300)}`);
  return texte ? JSON.parse(texte) : null;
}

const hex = (n) => randomBytes(n).toString('hex');
const uneLigne = (pem) => pem.trim().split('\n').join('\\n');

function secretsProduction() {
  const jwt = generateKeyPairSync('ed25519');
  return {
    COTIZ_JWT_PRIVATE_KEY: uneLigne(jwt.privateKey.export({ type: 'pkcs8', format: 'pem' })),
    COTIZ_JWT_PUBLIC_KEY: uneLigne(jwt.publicKey.export({ type: 'spki', format: 'pem' })),
    COTIZ_CODES_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    COTIZ_ALTCHA_HMAC_KEY: hex(32),
    COTIZ_LOG_PSEUDONYM_KEY: hex(32),
    COTIZ_DB_SUPERUSER_PASSWORD: hex(24),
    COTIZ_DB_MIGRATOR_PASSWORD: hex(24),
    COTIZ_DB_APP_PASSWORD: hex(24),
    COTIZ_DB_PLATFORM_PASSWORD: hex(24),
    COTIZ_DB_READONLY_PASSWORD: hex(24),
    COTIZ_S3_ACCESS_KEY_ID: `cotiz-${hex(6)}`,
    COTIZ_S3_SECRET_ACCESS_KEY: hex(24),
  };
}

function secretsVapid() {
  // Paire P-256 : clé publique non compressée (0x04 ‖ x ‖ y) et clé privée (d), en base64url (web-push).
  const vapid = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
  const publique = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(vapid.x, 'base64url'),
    Buffer.from(vapid.y, 'base64url'),
  ]);
  return { COTIZ_VAPID_PUBLIC_KEY: publique.toString('base64url'), COTIZ_VAPID_PRIVATE_KEY: vapid.d };
}

/** Mot de passe des comptes de démonstration (cible dev) : écrit pour son propriétaire seul, puis rangé dans Dokploy. */
function motDePasseDemo() {
  const motDePasse = `Dev-${hex(9)}`;
  writeFileSync(FICHIER_ACCES_DEV, `comptes de démonstration (IDENTIFIANTS.md) : ${motDePasse}\n`, { mode: 0o600 });
  return motDePasse;
}

const lireEnv = (texte) =>
  new Map(
    (texte ?? '')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );

// 1. Projet, environnement et service compose de la cible (créés s'ils manquent).
const projet = (await api('project.all')).find((p) => p.name === PROJET);
if (!projet) throw new Error(`projet Dokploy « ${PROJET} » introuvable`);
let environnement = projet.environments.find((e) => e.name === cible.environnement);
if (!environnement) {
  environnement = await api('environment.create', { name: cible.environnement, projectId: projet.projectId });
  console.log(`environnement ${cible.environnement} créé`);
}
let service = (environnement.compose ?? []).find((c) => c.name === cible.service);
if (!service) {
  service = await api('compose.create', {
    name: cible.service,
    environmentId: environnement.environmentId,
    composeType: 'docker-compose',
  });
  console.log(`service ${cible.service} créé`);
}
const { composeId } = service;
console.log(`cible ${nomCible} : service ${cible.service} (${composeId})`);

// 2. Source : dépôt public, branche, fichier compose.
await api('compose.update', {
  composeId,
  sourceType: 'git',
  customGitUrl: DEPOT,
  customGitBranch: branche,
  composePath: cible.compose,
  composeType: 'docker-compose',
  createEnvFile: true,
});
console.log(`source : ${DEPOT} (${branche}) › ${cible.compose}`);

// 3. Variables : existantes gardées, manquantes ajoutées.
const actuel = await api(`compose.one?composeId=${encodeURIComponent(composeId)}`);
const env = lireEnv(actuel.env);
const voulues = {
  ...cible.secrets(),
  COTIZ_PUBLIC_URL: `https://${cible.domaineApp}`,
  COTIZ_STORAGE_PUBLIC_URL: `https://${cible.domaineFichiers}`,
  COTIZ_WEB_PUSH_HOSTS: SERVICES_PUSH.join(','),
};
const ajoutees = [];
for (const [nom, valeur] of Object.entries(voulues)) {
  if (!env.has(nom)) {
    env.set(nom, valeur);
    ajoutees.push(nom);
  }
}
if (cible.motDePasseDemo && !env.has('COTIZ_DEV_SEED_PASSWORD')) {
  env.set('COTIZ_DEV_SEED_PASSWORD', motDePasseDemo());
  ajoutees.push('COTIZ_DEV_SEED_PASSWORD');
  console.log(`mot de passe des comptes de démonstration écrit dans ${FICHIER_ACCES_DEV} (droits 600)`);
} else if (cible.motDePasseDemo && !existsSync(FICHIER_ACCES_DEV)) {
  console.log(
    `mot de passe de démonstration déjà dans Dokploy, ${FICHIER_ACCES_DEV} absent : retirer COTIZ_DEV_SEED_PASSWORD pour en générer un autre`,
  );
}
// Mot de passe d'accès Traefik d'une version précédente (incompatible avec le jeton du front) : retiré.
env.delete('COTIZ_DEV_BASIC_AUTH');
await api('compose.saveEnvironment', {
  composeId,
  env: [...env].map(([k, v]) => `${k}=${v}`).join('\n'),
  createEnvFile: true,
});
console.log(`variables : ${env.size} (ajoutées : ${ajoutees.length ? ajoutees.join(', ') : 'aucune'})`);

// 4. Domaines (https, Let's Encrypt), sans middleware.
const domaines = await api(`domain.byComposeId?composeId=${encodeURIComponent(composeId)}`);
for (const [host, serviceName, port] of [
  [cible.domaineApp, 'web', 3000],
  [cible.domaineFichiers, 'minio', 9000],
]) {
  const existant = domaines.find((d) => d.host === host);
  if (existant?.middlewares?.length) {
    await api('domain.update', {
      domainId: existant.domainId,
      host,
      path: existant.path ?? '/',
      port: existant.port,
      https: existant.https,
      certificateType: existant.certificateType,
      serviceName: existant.serviceName,
      domainType: existant.domainType,
      middlewares: [],
    });
    console.log(`domaine ${host} : middlewares retirés`);
    continue;
  }
  if (existant) {
    console.log(`domaine ${host} : déjà là`);
    continue;
  }
  await api('domain.create', {
    host,
    path: '/',
    port,
    https: true,
    certificateType: 'letsencrypt',
    composeId,
    serviceName,
    domainType: 'compose',
  });
  console.log(`domaine ${host} → ${serviceName}:${port}`);
}

// 5. Déploiement.
if (deployer) {
  await api('compose.deploy', { composeId, title: `${nomCible} ${branche}` });
  console.log('déploiement lancé (suivi : onglet Deployments de Dokploy)');
}
