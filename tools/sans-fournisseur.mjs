// Recette « sans fournisseur » (lot 3.5, étape 2) : la boucle complète du jalon V1 passe sur une pile dont aucun
// conteneur applicatif ne porte de variable de fournisseur externe.
//   node tools/sans-fournisseur.mjs                       → pile Docker locale (app.yml, front sur :3080)
//   COTIZ_PROJET=cotiz-prod COTIZ_BASE=http://localhost:3090 COTIZ_STRICT=1 node tools/sans-fournisseur.mjs  → pile de production locale
// 1. `docker inspect` des conteneurs api, worker et web du projet compose : aucune variable de backend/test/acceptance/fournisseurs.ts ;
// 2. parcours `jalon` (frontend/tests/e2e/parcours.mjs) contre le front de cette pile.
// Code de sortie 1 au premier écart. Exige Docker (groupe `docker`, ou `sg docker -c`).
import { execFileSync, spawnSync } from 'node:child_process';
import { VARIABLE_FOURNISSEUR } from '../backend/test/acceptance/fournisseurs.ts';

const projet = process.env.COTIZ_PROJET ?? 'cotiz';
const base = process.env.COTIZ_BASE ?? 'http://localhost:3080';
const services = ['api', 'worker', 'web'];

let ecarts = 0;
for (const service of services) {
  const ids = execFileSync(
    'docker',
    [
      'ps',
      '-q',
      '--filter',
      `label=com.docker.compose.project=${projet}`,
      '--filter',
      `label=com.docker.compose.service=${service}`,
    ],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean);
  if (!ids.length) {
    console.error(`✗ ${service} : aucun conteneur en marche dans le projet compose « ${projet} »`);
    ecarts++;
    continue;
  }
  const env = JSON.parse(
    execFileSync('docker', ['inspect', '--format', '{{json .Config.Env}}', ids[0]], { encoding: 'utf8' }),
  );
  // Noms seulement : jamais les valeurs (secrets).
  const fautes = env.map((e) => e.split('=')[0]).filter((cle) => VARIABLE_FOURNISSEUR.test(cle));
  if (fautes.length) {
    console.error(`✗ ${service} : variable(s) de fournisseur définie(s) : ${fautes.join(', ')}`);
    ecarts++;
  } else console.log(`✓ ${service} : ${env.length} variables, aucune de fournisseur externe`);
}
if (ecarts) process.exit(1);

const r = spawnSync('node', ['tests/e2e/parcours.mjs', 'jalon'], {
  cwd: new URL('../frontend/', import.meta.url),
  stdio: 'inherit',
  env: { ...process.env, COTIZ_BASE: base },
});
process.exit(r.status ?? 1);
