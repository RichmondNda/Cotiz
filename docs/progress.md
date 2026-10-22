# Avancement

Mis à jour par `/fin-lot`. Statuts : `à faire` · `en cours` · `terminé` · `bloqué`.

## Front V0 (lots front, `prompts/`) — terminé

Tous les écrans de la maquette sur mocks Nitro, lots 00 à 09 fusionnés sur `main` (PR #1 à #7) : `frontend/`, CI (`.github/workflows/ci.yml`), contrat V0 `docs/api-v0.md` (retiré au lot 0.3), placeholders `docs/placeholders-v0.md`.

## Back-end et intégration (lots `docs/lots/`)

| Lot | Titre | Statut | Étape en cours | Terminé le | Jours estimés | Jours réels | Remarques |
|---|---|---|---|---|---|---|---|
| 0.1 | Monorepo, CI et environnements | terminé | — | 2026-10-01 | 4 | — | PR #9 ; CI complète en 5 min ; bascule de `sys.health` reportée au lot 0.3 (registre et proxy créés à son étape 4, aucun écran ni mock concerné) ; ClamAV local `unhealthy` à surveiller au lot 0.5 |
| 0.2 | Contrats et logique métier partagée | terminé | — | 2026-10-01 | 10 | — | 8 étapes ; 107 ids de `endpoints.yaml` au registre ; `packages/domain` couvert à 100 % ; casse de compilation vérifiée côté back, côté front reportée au lot 0.3 (le front n'importe pas encore `@cotiz/contracts`) |
| 0.3 | Aligner la V0 du front sur le contrat | terminé | — | 2026-10-09 | 8 | — | PR #11 (vers `backend`), 6 étapes sur une seule PR ; 113 opérations simulées sous `/api/v1` contrôlées par leur schéma ; `sys.health` seul en réel (aucun écran ne l'appelle) ; `docs/api-v0.md` retiré ; `frontend/types` réduit aux types d'interface ; exception d'audit temporaire (ADR 0016, réexamen au plus tard le 2026-11-09) |
| 0.4 | Base de données, isolation et contexte tenant | terminé | — | 2026-10-09 | 7 | — | 6 étapes sur une seule PR (vers `backend`) ; aucune table métier : test de fumée RLS porté sur `schema.sql` (6 scénarios + 3d), harnais d'isolation sur la base migrée ; garde-fou `auditTenantSecurity` (RLS, politiques, droits) en CI ; `updateWithVersion` (412/404 sous RLS) ; point de spec à trancher avant le lot 1.2 : `associations.member_read` et `memberships.self_read` sans condition d'espace ; reports au lot 0.5 (412 sans détail, 42501 jamais en 403 détaillé) |
| 0.5 | Socle transverse : outbox, stockage, audit, idempotence | terminé | — | 2026-10-10 | 8 | — | 6 étapes sur une seule PR (vers `backend`) ; spec modifiée avec accord : `outbox_events.actor_user_id`, `files.sha256` nullable, `files.owner_access` limité à la preuve du souscripteur, `audit_no_truncate`, `internal_error` ; `fl.upload`/`fl.get` prêts, bascule au lot 1.1 (garde d'authentification) ; job CI `antivirus` (clamd réel) ; démonstration locale sur base jetable (volume PostgreSQL local antérieur au script des rôles) ; reports consignés pour 1.1, 1.2, 3.3, 7.1 |
| 0.6 | Observabilité minimale | terminé | — | 2026-10-10 | 3 | — | 3 étapes sur une seule PR (vers `backend`) ; journaux pino (requestId, traceId, association, utilisateur pseudonymisé HMAC, masquage), `/metrics` interne par processus (api 9464 : RED ; worker 9465 : files BullMQ et outbox, l'outbox n'étant lisible qu'en espace system), tableau `infra/grafana/sante-api.json`, traces OpenTelemetry (exportateur `none` par défaut) et GlitchTip back et front inactifs sans DSN ; aucune variable requise en local ; route de démonstration `GET /api/v1/__debug/error` (développement) ; reports au lot 7.1 : chaînage de trace par l'outbox, traceId des jobs en échec signalés, préchargement éventuel du SDK GlitchTip front par Nuxt, ports 9464/9465 jamais publiés, échantillonnage 10 % / 100 % des erreurs au Collector |
| 1.1 | Identité, authentification et activation | terminé | — | 2026-10-16 | 11 | — | 10 étapes sur une seule PR (vers `backend`) ; migration 0005 (`sessions.remember_me` + index, accord) ; spec modifiée avec accord : `wrong_space` pour auth.activate, durée absolue de connexion 30 j (03-auth), bascule par espace (architecture/10), décision 22 (essais de code d'un identifiant inconnu comptés dans Redis) ; front : seul l'espace `/plateforme` basculé (auth.*, me, fl.upload, fl.get), rendu côté client, compte de dev `COTIZ_DEV_SEED=1 … cli seed-dev` ; démonstration locale sur base jetable (MIGRATION_DATABASE_URL absente des env locaux) ; reports au lot 1.2 : gardes avec accès base (`lookupAsSelf` : rôles plateforme et appartenances, MembershipGuard réel, contexte association sur `/me`, `aid` des sessions d'association), bascule gestionnaire/souscripteur et suppression des handlers simulés, notification des gestionnaires à l'activation et demandes de réinitialisation rattachées à l'association, politique RLS plateforme sur one_time_codes ; lot 2.3 : `reveal` limité au dernier code ; à trancher : maquette « 8 caractères minimum » contre 10 exigés (spec), durée de 7 j des demandes non traitées, ADR connexion PgBouncer tenue pendant argon2 ; CI non encore exécutée (branche non poussée) |
| 1.2 | Associations, plans et abonnements (socle) | terminé | — | 2026-10-22 | 8 | — | 5 étapes sur une seule PR (#16, vers `backend`) ; migrations 0006 (tenancy) et 0007 (billing), RLS forcée sur les 4 tables à `association_id` (`plans` globale, sans RLS) ; décision 9 adoptée (valeurs de `seed-reference.yaml`), ADR 0017 (accès `cotiz_platform`, `If-Match` par opération), décisions 23 à 26 ; `pub.plans`, `pf.plans`, `pf.plan.write`, `pf.plan.archive` basculés, handlers simulés supprimés ; espaces gestionnaire et souscripteur basculés ; `QuotaService` (limites en cache 5 min) ; écart d'interface `sa-plans` (note retirée) ; démonstration locale (plan archivé absent de `pub.plans`, abonnement conservé) ; PR #17 avant fusion : `nuxt` 4.6.2 (nouvelles alertes d'audit), ADR 0016 révisé (2 exceptions restantes) ; `pnpm verify` vert en CI, en local instable sous WSL (relais de ports de Docker Desktop) |
| 1.3 | Demandes, approbation et création directe | à faire | — | — | 9 | — | |
| 1.4 | Gestion des associations et tableau de bord plateforme | à faire | — | — | 8 | — | |
| 2.1 | Espace association et configuration | à faire | — | — | 5 | — | |
| 2.2 | Projets | à faire | — | — | 9 | — | |
| 2.3 | Souscripteurs, inscriptions, échéances et codes à remettre | à faire | — | — | 13 | — | |
| 2.4 | Registre : grille et validation des paiements | à faire | — | — | 14 | — | |
| 2.5 | Notifications dans l'application | à faire | — | — | 5 | — | |
| 2.6 | Rapport de projet et tableau de bord | à faire | — | — | 6 | — | |
| 3.1 | Activation du souscripteur, profil et réinitialisations | à faire | — | — | 5 | — | |
| 3.2 | Tableau de bord et projets du souscripteur | à faire | — | — | 5 | — | |
| 3.3 | Déclaration de paiement | à faire | — | — | 8 | — | |
| 3.4 | Historique du souscripteur | à faire | — | — | 3 | — | |
| 3.5 | Recette locale du jalon V1 | à faire | — | — | 5 | — | |
| 4.1 | Contrats et génération PDF | à faire | — | — | 12 | — | |
| 4.2 | Temps réel et Web Push | à faire | — | — | 9 | — | |
| 4.3 | Relances automatiques et file « À relancer » | à faire | — | — | 6 | — | |
| 4.4 | Imports en masse | à faire | — | — | 8 | — | |
| 4.5 | Équipe et multi-associations | à faire | — | — | 5 | — | |
| 4.6 | Facturation, exports et statistiques d'usage | à faire | — | — | 9 | — | |
| 4.7 | Sécurité renforcée et audit consultable | à faire | — | — | 6 | — | |
| 5.1 | Rapprochement par relevés importés | à faire | — | — | 12 | — | |
| 5.2 | API publique, webhooks sortants et analytique | à faire | — | — | 18 | — | |
| 6.1 | Email (option) | à faire | — | — | 6 | — | |
| 6.2 | Passerelle SMS (option) | à faire | — | — | 6 | — | |
| 6.3 | Paiement en ligne via prestataire agréé (option) | à faire | — | — | 25 | — | |
| 7.1 | Mise en ligne : recette Dokploy, observabilité et production | à faire | — | — | 10 | — | |
