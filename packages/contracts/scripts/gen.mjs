#!/usr/bin/env node
// Génère src/generated/*.ts depuis docs/specs/*.yaml : ErrorCode, EndpointId, Permission, Feature, EventType, libellés de statut,
// énumérations de schema.sql.
//   node scripts/gen.mjs           → écrit les fichiers
//   node scripts/gen.mjs --check   → échoue si un fichier n'est pas à jour (test et CI)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { parse } from 'yaml';

const specsDir = new URL('../../../docs/specs/', import.meta.url);
const outDir = new URL('../src/generated/', import.meta.url);
const specs = (file) => parse(readFileSync(new URL(file, specsDir), 'utf8'));

/** `CREATE TYPE x AS ENUM ('a', 'b')` de schema.sql → { x: ['a', 'b'] }. */
export function schemaEnums(sql) {
  const enums = {};
  for (const [, name, values] of sql.matchAll(/CREATE TYPE (\w+) AS ENUM \(([^)]*)\)/g)) {
    enums[name] = [...values.matchAll(/'([^']*)'/g)].map((m) => m[1]);
  }
  return enums;
}

const header = (source) =>
  `// Généré par scripts/gen.mjs depuis docs/specs/${source}. Ne pas modifier : lancer « pnpm --filter contracts gen ».\n\n`;
const str = (value) => `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const list = (name, values) => `export const ${name} = [\n${values.map((v) => `  ${str(v)},\n`).join('')}] as const;\n`;

function union(source, constName, typeName, values, doc) {
  return (
    header(source) +
    `/** ${doc} */\n` +
    list(constName, values) +
    `export type ${typeName} = (typeof ${constName})[number];\n`
  );
}

function render() {
  const { errors } = specs('errors.yaml');
  const { endpoints } = specs('endpoints.yaml');
  const { permissions } = specs('permissions.yaml');
  const { features } = specs('features.yaml');
  const { events } = specs('events.yaml');
  const { statuses } = specs('status-mapping.yaml');
  const dbEnums = schemaEnums(readFileSync(new URL('schema.sql', specsDir), 'utf8'));

  // Rôles de permissions.yaml : une faute de frappe refuserait la permission en silence.
  const knownRoles = new Set([
    '*',
    '*authenticated',
    'subscriber',
    ...dbEnums.platform_staff_role.map((role) => `platform:${role}`),
    ...dbEnums.memberships_role.filter((role) => role !== 'subscriber').map((role) => `association:${role}`),
  ]);
  for (const { permission, roles } of permissions) {
    const unknown = roles.filter((role) => !knownRoles.has(role));
    if (unknown.length > 0)
      throw new Error(`permissions.yaml : rôle inconnu pour ${permission} : ${unknown.join(', ')}`);
  }

  const errorEntries = errors.map((e) => `  ${e.code}: { http: ${e.http}, message: ${str(e.message)} },\n`).join('');

  return {
    'error-codes.ts':
      union(
        'errors.yaml',
        'ERROR_CODES',
        'ErrorCode',
        errors.map((e) => e.code),
        'Codes stables des erreurs `Problem`.',
      ) +
      `\n/** Statut HTTP et message affichable de chaque code. */\n` +
      `export const ERRORS = {\n${errorEntries}} as const satisfies Record<ErrorCode, { http: number; message: string }>;\n`,
    'endpoint-ids.ts': union(
      'endpoints.yaml',
      'ENDPOINT_IDS',
      'EndpointId',
      endpoints.map((e) => e.id),
      "Identifiants d'endpoint (une ressource, une ou plusieurs opérations HTTP).",
    ),
    'permissions.ts':
      union(
        'permissions.yaml',
        'PERMISSIONS',
        'Permission',
        permissions.map((p) => p.permission),
        'Permissions vérifiées par les gardes du back et `usePermissions()` du front.',
      ) +
      `\n/**\n * Rôles qui détiennent chaque permission : \`platform:<rôle>\`, \`association:<rôle>\`, \`subscriber\`, \`*\` (tout le monde),\n` +
      ` * \`*authenticated\` (toute personne connectée).\n */\n` +
      `export const PERMISSION_ROLES = {\n${permissions
        .map((p) => `  ${str(p.permission)}: [${p.roles.map(str).join(', ')}],\n`)
        .join('')}} as const satisfies Record<Permission, readonly string[]>;\n`,
    'status-labels.ts':
      header('status-mapping.yaml') +
      `/** Libellé affiché et ton (couleur fonctionnelle) de chaque statut, par famille \`table.colonne\`. */\n` +
      `export const STATUS_LABELS = {\n${Object.entries(statuses)
        .map(
          ([family, values]) =>
            `  ${str(family)}: {\n${values.map((v) => `    ${v.value}: { label: ${str(v.label)}, tone: ${str(v.tone)} },\n`).join('')}  },\n`,
        )
        .join('')}} as const;\n` +
      `export type StatusFamily = keyof typeof STATUS_LABELS;\n` +
      `export type StatusTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';\n`,
    'db-enums.ts':
      header('schema.sql') +
      `/** Valeurs des types \`ENUM\` de la base, par nom de type. */\n` +
      `export const DB_ENUMS = {\n${Object.entries(dbEnums)
        .map(([name, values]) => `  ${name}: [${values.map(str).join(', ')}],\n`)
        .join('')}} as const;\n` +
      `export type DbEnum = keyof typeof DB_ENUMS;\n`,
    'event-types.ts':
      union(
        'events.yaml',
        'EVENT_TYPES',
        'EventType',
        events.map((e) => e.type),
        "Types d'événements de domaine (outbox, webhooks sortants).",
      ) +
      `\n/** Version courante et clés du payload de chaque type (enveloppe : architecture/05-events-jobs.md). */\n` +
      `export const EVENTS = {\n${events
        .map((e) => `  ${str(e.type)}: { version: ${e.version}, payload: [${e.payload.map(str).join(', ')}] },\n`)
        .join('')}} as const satisfies Record<EventType, { version: number; payload: readonly string[] }>;\n`,
    'features.ts':
      union(
        'features.yaml',
        'FEATURES',
        'Feature',
        features.map((f) => f.key),
        'Fonctionnalités exposées par `GET /me` (`features`).',
      ) +
      `\n/** Lot qui livre chaque fonctionnalité ; \`planGated\` : dépend aussi du plan ; \`externalProvider\` : groupe 6. */\n` +
      `export const FEATURE_SPECS = {\n${features
        .map(
          (f) =>
            `  ${f.key}: { lot: ${str(f.lot)}, planGated: ${Boolean(f.planGated)}, externalProvider: ${Boolean(f.externalProvider)} },\n`,
        )
        .join(
          '',
        )}} as const satisfies Record<Feature, { lot: string; planGated: boolean; externalProvider: boolean }>;\n`,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

async function main() {
  const check = process.argv.includes('--check');
  const stale = [];
  if (!check) mkdirSync(outDir, { recursive: true });
  for (const [name, raw] of Object.entries(render())) {
    const file = new URL(name, outDir);
    const path = fileURLToPath(file);
    // Même formatage que `prettier --check` de pnpm lint.
    const content = await format(raw, { ...(await resolveConfig(path)), filepath: path });
    const current = existsSync(file) ? readFileSync(file, 'utf8') : null;
    if (current === content) continue;
    if (check) stale.push(name);
    else writeFileSync(file, content);
  }
  if (stale.length) {
    console.error(`src/generated/ n'est pas à jour (${stale.join(', ')}) : lancer « pnpm --filter contracts gen ».`);
    process.exit(1);
  }
  if (!check) console.log(`src/generated/ régénéré depuis ${fileURLToPath(specsDir)}`);
}
