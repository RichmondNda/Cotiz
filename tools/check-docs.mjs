#!/usr/bin/env node
// Contrôle de cohérence de docs/specs et docs/lots. Lancé par `pnpm verify`.
// Dépendance : `yaml` (devDependency à la racine).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'yaml';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const specs = (f) => parse(readFileSync(path.join(root, 'docs/specs', f), 'utf8'));
const errors = [];
const fail = (m) => errors.push(m);

const { endpoints } = specs('endpoints.yaml');
const { screens } = specs('screens.yaml');
const errorCodes = new Set(specs('errors.yaml').errors.map((e) => e.code));
const events = new Set(specs('events.yaml').events.map((e) => e.type));
const permissions = new Set(specs('permissions.yaml').permissions.map((p) => p.permission));
const features = specs('features.yaml').features;
const lotFiles = readdirSync(path.join(root, 'docs/lots')).filter((f) => /^\d+\.\d+-.+\.md$/.test(f));
const lots = new Set(lotFiles.map((f) => f.split('-')[0]));

const ids = new Set();
const ops = new Set();
for (const e of endpoints) {
  if (ids.has(e.id)) fail(`endpoint en double : ${e.id}`);
  ids.add(e.id);
  if (!lots.has(e.lot)) fail(`${e.id} : lot ${e.lot} sans fichier dans docs/lots`);
  if (!permissions.has(e.permission)) fail(`${e.id} : permission inconnue ${e.permission}`);
  for (const c of e.errors) if (!errorCodes.has(c)) fail(`${e.id} : erreur inconnue ${c}`);
  for (const ev of e.emits) if (!events.has(ev)) fail(`${e.id} : événement inconnu ${ev}`);
  for (const o of e.operations) {
    const k = `${o.method} ${o.path}`;
    if (ops.has(k)) fail(`opération en double : ${k}`);
    ops.add(k);
  }
}
for (const s of screens) {
  for (const id of s.endpoints) if (!ids.has(id)) fail(`écran ${s.id} : endpoint inconnu ${id}`);
  for (const k of ['realAtLot', 'completeAtLot']) if (s[k] && !lots.has(s[k])) fail(`écran ${s.id} : ${k} ${s[k]} inconnu`);
}
for (const f of features) if (!lots.has(f.lot)) fail(`feature ${f.key} : lot ${f.lot} inconnu`);

const progress = readFileSync(path.join(root, 'docs/progress.md'), 'utf8');
for (const l of lots) if (!new RegExp(`^\\| ${l.replace('.', '\\.')} \\|`, 'm').test(progress)) fail(`progress.md : lot ${l} absent`);

// Si le registre du contrat existe (à partir du lot 0.2), il doit couvrir exactement endpoints.yaml.
const registry = path.join(root, 'packages/contracts/src/endpoint-ids.generated.ts');
if (existsSync(registry)) {
  const src = readFileSync(registry, 'utf8');
  for (const id of ids) if (!src.includes(`'${id}'`)) fail(`packages/contracts : endpoint ${id} absent du registre généré`);
}

if (errors.length) {
  console.error(`check-docs : ${errors.length} problème(s)\n- ` + errors.join('\n- '));
  process.exit(1);
}
console.log(`check-docs : OK (${ids.size} endpoints, ${ops.size} opérations, ${screens.length} écrans, ${lots.size} lots)`);
