import { fileURLToPath } from 'node:url';

/** Identifiant PostgreSQL sans guillemets ; 63 caractères au plus (au-delà, PostgreSQL tronque sans prévenir). */
const TABLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

/**
 * SQL d'isolation d'une table d'association, identique à docs/specs/schema.sql : RLS activée et forcée (le
 * propriétaire n'y échappe pas), politique `tenant_isolation` en lecture et en écriture. À coller dans la migration
 * qui crée la table (`pnpm --filter @cotiz/db rls <table>`), suivi des politiques souscripteur ou system éventuelles.
 */
export function enableTenantRls(table: string): string {
  if (!TABLE_NAME.test(table)) throw new Error(`enableTenantRls : nom de table invalide (${JSON.stringify(table)})`);
  return [
    `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`,
    `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`,
    `CREATE POLICY tenant_isolation ON ${table}`,
    '  USING (association_id = app_association_id())',
    '  WITH CHECK (association_id = app_association_id());',
  ].join('\n');
}

export interface SecurityProblem {
  table: string;
  /**
   * `rls_disabled`, `rls_not_forced`, `missing_tenant_isolation`, `tenant_isolation_altered`,
   * `policy_without_context:<politique>` ou `<rôle>:<droit>`.
   */
  problem: string;
}

interface Queryable {
  query(text: string): Promise<{ rows: unknown[] }>;
}

const TENANT_EXPRESSION = '(association_id = app_association_id())';
const CONTEXT_FUNCTION = /app_(association_id|user_id|space)\(\)/;

/**
 * Politiques permissives qui ne dépendent pas du contexte, voulues par docs/specs/schema.sql. Toute autre politique
 * sans app_*() s'ajouterait par OU aux autres et ouvrirait la table (ex. `USING (true)`).
 */
const CONTEXT_FREE_ALLOWED: readonly { table: string; policy: string; expression: string }[] = [
  // Ajout seul, quel que soit l'espace : lecture réservée au relais (system) et aux politiques de lecture.
  { table: 'outbox_events', policy: 'append', expression: 'true' },
  { table: 'audit_logs', policy: 'append', expression: 'true' },
  // Modèles de messages de la plateforme, lisibles par tous.
  { table: 'message_templates', policy: 'platform_templates_read', expression: '(association_id IS NULL)' },
];
const APP_ROLES = ['cotiz_app', 'cotiz_platform'] as const;
const ROLES = [...APP_ROLES, 'cotiz_readonly'] as const;
const PRIVILEGES = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER'] as const;
type Role = (typeof ROLES)[number];
type Privilege = (typeof PRIVILEGES)[number];

/** Droits interdits (architecture/02, fin de schema.sql). TRUNCATE ignore la RLS ; TRIGGER exécuterait du code. */
function forbidden(table: string, role: Role): Set<Privilege> {
  const denied = new Set<Privilege>(['TRUNCATE', 'TRIGGER']);
  if (role === 'cotiz_readonly') ['INSERT', 'UPDATE', 'DELETE'].forEach((p) => denied.add(p as Privilege));
  if (role !== 'cotiz_readonly') {
    // Données financières : pas de suppression physique. Journal d'audit et signatures : ajout seul.
    if (['payments', 'allocations', 'installments', 'invoices'].includes(table)) denied.add('DELETE');
    if (['audit_logs', 'contract_signatures'].includes(table))
      ['UPDATE', 'DELETE'].forEach((p) => denied.add(p as Privilege));
  }
  return denied;
}

interface TableRow {
  schema: string;
  relname: string;
  owner: string;
  policy_roles: string[] | null;
  has_association_id: boolean;
  not_null: boolean;
  rls: boolean;
  forced: boolean;
  policy_cmd: string | null;
  policy_permissive: string | null;
  qual: string | null;
  with_check: string | null;
  granted: string[];
  policies: { name: string; qual: string | null; with_check: string | null }[];
}

/**
 * Garde-fou de toutes les tables (schémas système exclus ; hors de public, le nom est préfixé du schéma),
 * interrogé en CI sur la base migrée :
 * - toute table avec une colonne `association_id` a la RLS activée et forcée ;
 * - si `association_id` est NOT NULL, la politique `tenant_isolation` existe, telle que produite par enableTenantRls ;
 * - toute politique permissive dépend du contexte (app_*()), sauf exceptions de schema.sql (CONTEXT_FREE_ALLOWED) ;
 * - toute table appartient à cotiz_migrator (le propriétaire peut désactiver la RLS ou supprimer les politiques) ;
 * - aucun rôle applicatif n'a de droit interdit (TRUNCATE, TRIGGER, écriture en lecture seule, suppression de
 *   l'argent, modification du journal d'audit), y compris accordé colonne par colonne.
 * Limite : une expression qui cite app_*() sans en dépendre (`true OR app_space() IS NULL`) n'est pas détectée.
 */
export async function auditTenantSecurity(client: Queryable): Promise<SecurityProblem[]> {
  const grantChecks = ROLES.flatMap((role) =>
    PRIVILEGES.map(
      // INSERT et UPDATE : droits de table ou d'une seule colonne.
      (privilege) =>
        `CASE WHEN ${['INSERT', 'UPDATE'].includes(privilege) ? 'has_any_column_privilege' : 'has_table_privilege'}('${role}', c.oid, '${privilege}') THEN '${role}:${privilege}' END`,
    ),
  );
  const { rows } = await client.query(`
    SELECT n.nspname AS schema, c.relname AS relname, pg_get_userbyid(c.relowner) AS owner,
           a.attname IS NOT NULL AS has_association_id,
           coalesce(a.attnotnull, false) AS not_null,
           c.relrowsecurity AS rls,
           c.relforcerowsecurity AS forced,
           p.cmd AS policy_cmd, p.permissive AS policy_permissive, p.roles::text[] AS policy_roles, p.qual, p.with_check,
           array_remove(ARRAY[${grantChecks.join(', ')}], NULL) AS granted,
           coalesce((SELECT json_agg(json_build_object('name', pp.policyname, 'qual', pp.qual, 'with_check', pp.with_check)
                                     ORDER BY pp.policyname)
                       FROM pg_policies pp
                      WHERE pp.schemaname = n.nspname AND pp.tablename = c.relname AND pp.permissive = 'PERMISSIVE'),
                    '[]') AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'association_id' AND NOT a.attisdropped
      LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname AND p.policyname = 'tenant_isolation'
     WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg\\_%'
       AND c.relkind IN ('r', 'p')
     ORDER BY n.nspname <> 'public', n.nspname, c.relname`);

  const problems: SecurityProblem[] = [];
  for (const row of rows as TableRow[]) {
    const table = row.schema === 'public' ? row.relname : `${row.schema}.${row.relname}`;
    const add = (problem: string) => problems.push({ table, problem });
    if (row.has_association_id) {
      if (!row.rls) add('rls_disabled');
      if (!row.forced) add('rls_not_forced');
      if (row.not_null && row.policy_cmd === null) add('missing_tenant_isolation');
    }
    if (
      row.policy_cmd !== null &&
      (row.policy_cmd !== 'ALL' ||
        row.policy_permissive !== 'PERMISSIVE' ||
        row.policy_roles?.join(',') !== 'public' ||
        row.qual !== TENANT_EXPRESSION ||
        row.with_check !== TENANT_EXPRESSION)
    ) {
      add('tenant_isolation_altered');
    }
    for (const policy of row.policies) {
      const contextFree = [policy.qual, policy.with_check].some(
        (expression) =>
          expression !== null &&
          !CONTEXT_FUNCTION.test(expression) &&
          !CONTEXT_FREE_ALLOWED.some(
            (allowed) => allowed.table === table && allowed.policy === policy.name && allowed.expression === expression,
          ),
      );
      if (contextFree) add(`policy_without_context:${policy.name}`);
    }
    if (row.owner !== 'cotiz_migrator') add(`owner:${row.owner}`);
    for (const role of ROLES) {
      const denied = forbidden(table, role);
      for (const privilege of PRIVILEGES) {
        if (denied.has(privilege) && row.granted.includes(`${role}:${privilege}`)) add(`${role}:${privilege}`);
      }
    }
  }
  return problems;
}

// `pnpm --filter @cotiz/db rls <table>` : affiche le SQL à coller dans la migration.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const table = process.argv[2];
  if (!table) {
    console.error('usage : pnpm --filter @cotiz/db rls <table>');
    process.exit(1);
  }
  console.log(enableTenantRls(table));
}
