#!/usr/bin/env node
// Recette sur Dokploy (lot 7.1, étape 2, anticipée) : configure le service compose `cotiz-recette` par l'API Dokploy.
//
//   node tools/recette-dokploy.mjs [--branche backend] [--deployer]
//
// - Clé d'API : DOKPLOY_API_KEY, sinon ~/.config/cotiz-dokploy.key (droits 600). URL : DOKPLOY_URL (http://localhost:3000).
// - Source : dépôt GitHub public, branche choisie, infra/compose/staging.yml.
// - Variables (onglet Environment) : les secrets ne sont générés qu'une fois ; ceux déjà présents sont gardés tels quels
//   (en changer un casserait la base, les sessions ou les codes chiffrés). Rien n'est affiché : noms seulement.
// - Domaines : application et stockage public, https Let's Encrypt (DNS *.regisnda.com vers ce serveur).
// - --deployer : lance le déploiement (construction des images sur ce serveur, quelques minutes).
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJET = 'Cotiz';
const SERVICE = 'cotiz-recette';
const DEPOT = 'https://github.com/RichmondNda/Cotiz.git';
const COMPOSE = './infra/compose/staging.yml';
const DOMAINE_APP = process.env.COTIZ_RECETTE_DOMAINE ?? 'cotiz.regisnda.com';
const DOMAINE_FICHIERS = process.env.COTIZ_RECETTE_DOMAINE_FICHIERS ?? 'cotiz-fichiers.regisnda.com';
// Services de push des navigateurs courants (docs/runbooks/web-push.md) : jamais dans le code de l'application.
const SERVICES_PUSH = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.apple.com',
  'notify.windows.com',
];

const args = process.argv.slice(2);
const opt = (nom, defaut) => {
  const i = args.indexOf(`--${nom}`);
  return i >= 0 ? args[i + 1] : defaut;
};
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

function secretsNeufs() {
  const jwt = generateKeyPairSync('ed25519');
  // VAPID : paire P-256, clé publique non compressée (0x04 ‖ x ‖ y) et clé privée (d), en base64url (web-push).
  const vapid = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ format: 'jwk' });
  const publique = Buffer.concat([
    Buffer.from([4]),
    Buffer.from(vapid.x, 'base64url'),
    Buffer.from(vapid.y, 'base64url'),
  ]);
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
    COTIZ_VAPID_PUBLIC_KEY: publique.toString('base64url'),
    COTIZ_VAPID_PRIVATE_KEY: vapid.d,
  };
}

const lireEnv = (texte) =>
  new Map(
    (texte ?? '')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
  );

// 1. Service compose du projet.
const projet = (await api('project.all')).find((p) => p.name === PROJET);
if (!projet) throw new Error(`projet Dokploy « ${PROJET} » introuvable`);
const service = projet.environments.flatMap((e) => e.compose ?? []).find((c) => c.name === SERVICE);
if (!service) throw new Error(`service compose « ${SERVICE} » introuvable dans « ${PROJET} »`);
const { composeId } = service;
console.log(`service ${SERVICE} (${composeId})`);

// 2. Source : dépôt public, branche, fichier de recette.
await api('compose.update', {
  composeId,
  sourceType: 'git',
  customGitUrl: DEPOT,
  customGitBranch: branche,
  composePath: COMPOSE,
  composeType: 'docker-compose',
  createEnvFile: true,
});
console.log(`source : ${DEPOT} (${branche}) › ${COMPOSE}`);

// 3. Variables : existantes gardées, manquantes ajoutées.
const actuel = await api(`compose.one?composeId=${encodeURIComponent(composeId)}`);
const env = lireEnv(actuel.env);
const voulues = {
  ...secretsNeufs(),
  COTIZ_PUBLIC_URL: `https://${DOMAINE_APP}`,
  COTIZ_STORAGE_PUBLIC_URL: `https://${DOMAINE_FICHIERS}`,
  COTIZ_WEB_PUSH_HOSTS: SERVICES_PUSH.join(','),
};
const ajoutees = [];
for (const [nom, valeur] of Object.entries(voulues)) {
  if (!env.has(nom)) {
    env.set(nom, valeur);
    ajoutees.push(nom);
  }
}
await api('compose.saveEnvironment', {
  composeId,
  env: [...env].map(([k, v]) => `${k}=${v}`).join('\n'),
  createEnvFile: true,
});
console.log(`variables : ${env.size} (ajoutées : ${ajoutees.length ? ajoutees.join(', ') : 'aucune'})`);

// 4. Domaines (https, Let's Encrypt).
const domaines = await api(`domain.byComposeId?composeId=${encodeURIComponent(composeId)}`);
for (const [host, serviceName, port] of [
  [DOMAINE_APP, 'web', 3000],
  [DOMAINE_FICHIERS, 'minio', 9000],
]) {
  if (domaines.some((d) => d.host === host)) {
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
  await api('compose.deploy', { composeId, title: `recette ${branche}` });
  console.log('déploiement lancé (suivi : onglet Deployments de Dokploy)');
}
