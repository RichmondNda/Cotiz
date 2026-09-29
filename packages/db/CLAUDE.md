# packages/db — schéma, migrations, RLS, seeds

- Schéma cible : `docs/specs/schema.sql`. Chaque lot crée **ses** tables (commentaire « lot x.y » dans le fichier) ; les migrations doivent produire un schéma équivalent (types, contraintes, index, politiques).
- Clé étrangère vers une table d'un lot ultérieur (ex. `files.association_id` au lot 0.5 → `associations` au lot 1.2) : ajoutée dans la migration du lot qui crée la table cible.
- Migrations SQL versionnées dans `migrations/` ; une migration commitée ne se modifie jamais (hook bloquant).
- Toute table avec `association_id` : `enableTenantRls(table)` + politiques souscripteur si nécessaire. Le test méta sur `pg_policies` doit rester vert.
- Rôles : `cotiz_migrator` (migrations), `cotiz_app` (sans BYPASSRLS), `cotiz_platform` (BYPASSRLS, /platform), `cotiz_readonly`.
- Seeds : `seeds/reference.ts` (depuis `docs/specs/seed-reference.yaml`), `seeds/demo.ts` (déclarations réalistes), `seeds/load.ts` (50 000 échéances pour les tests de performance).
- `docs/specs/rls-smoke-test.sql` doit passer sur une base migrée.
