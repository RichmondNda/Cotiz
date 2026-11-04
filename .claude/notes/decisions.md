# Décisions prises en mode autonome

Format : **date** · sujet — décision (option retenue) · raison. Les décisions de projet vont dans `docs/decisions.md` ou un ADR.

- **2026-11-02** · branche de la mise en place des notes — Branche `chore/notes-claude` créée depuis `origin/backend`
  (et non depuis `main`). · `main` est 176 commits derrière `backend`, qui est la branche d'intégration où se fait le travail
  (`CLAUDE.md`) ; on ne commite pas directement sur la branche par défaut. La PR éventuelle visera `backend`.
- **2026-11-02** · vérifications avant commit — Pas de `pnpm verify` pour ce commit. · Le changement ne touche que des fichiers
  Markdown (`.claude/notes/`, `CLAUDE.md`), ignorés par Prettier et hors du périmètre lint/types/tests ; de plus les dépendances
  ne sont pas installées sur cette machine (voir `apprentissages.md`). Contrôle fait à la place : `git diff --stat` limité à ces fichiers.
- **2026-11-02** · statut du lot 2.4 — `terminé` au 2026-11-02 (date de fusion de la PR #25), avec dans les remarques ce qui n'a pas
  pu être vérifié. · Les 9 étapes sont fusionnées, chaque point de la définition de fini a un test dans le code, et les échecs locaux
  viennent tous de l'absence de Docker (aucune assertion en échec). Précédent : le lot 1.1 avait été clôturé avec « CI non encore
  exécutée ». La CI et la revue humaine restent à confirmer (`a-verifier.md`) ; s'il y a un problème, on repasse le lot `en cours`.
- **2026-11-02** · mode autonome pour `/lot` — Plan consigné ici puis exécuté sans validation (`CLAUDE.md`, `.claude/commands/lot.md`).
  Une décision métier `ouvert` ou une contradiction avec `docs/specs/` arrête toujours le travail. · Accord de l'utilisateur (« je serais
  pas toujours dispo pour valider ») ; les décisions `ouvert` sont des choix de produit, pas des choix techniques.
- **2026-11-02** · installation de pnpm — `corepack enable --install-directory ~/.local/bin` plutôt que `corepack enable` (qui écrit
  dans `/usr/bin`, donc sudo). · Version imposée par `packageManager` ; rien à modifier sur le système.
- **2026-11-02** · emplacement des notes — Notes dans `.claude/notes/`, versionnées (le `.gitignore` n'exclut que
  `.claude/settings.local.json`). · Demande explicite ; versionner permet de les retrouver sur toute machine.
- **2026-11-02** · nuxt 4.6.4 — Branche `chore/nuxt-4.6.4` depuis `origin/backend` (pas un lot, d'où `chore/`) ; nouvelle date de
  réexamen de l'ADR 0016 fixée au 2026-12-07 (environ un mois, comme les révisions précédentes). `/verifier-ecran` non lancé :
  montée de correctif sans bascule, et le serveur MCP chrome-devtools ne se connectait pas.
- **2026-11-03** · plan du lot 2.5 (branche `lot/2.5-notifications-in-app`, une seule PR vers `backend`, un commit par étape,
  comme le lot 2.4 / PR #25). Lu : `docs/lots/2.5`, `architecture/07`, `events.yaml`, `jobs.yaml`, `schema.sql` (lot 2.5),
  `endpoints.yaml` (`nt.list`, `nt.read`), contrats `packages/contracts/src/endpoints/common.ts` (déjà là depuis 0.3).
  1. **Tables et canaux** — migration `00xx_notifications.sql` (`notifications`, `deliveries`, enums `delivery_channel`,
     `deliveries_status`, index `notifications_unread`, RLS `owner_access` + `system_access` à l'identique de `schema.sql`),
     tables Drizzle dans `@cotiz/db`, tests d'isolation (politique affaiblie). Module `notifications` : interface
     `NotificationChannel`, canaux `in_app` (ligne + invalidation du compteur) et `manual` (aucun envoi), routeur + matrice.
     Vérif : un canal absent ou désactivé est ignoré sans erreur.
  2. **Consommateurs** — `payment.declared/validated/rejected/reverted`, `member.enrolled` (compte existant),
     `user.activated`, `password_reset.requested`, `association.request_submitted` ; `dedupe_key` `{eventId}:{userId}` ;
     plus de 5 déclarations en 1 h pour une association → une notification récapitulative. Vérif : un paiement validé →
     exactement une notification, même rejoué.
  3. **API** — `nt.list` (curseur, filtres `unread`/`type`, espace courant), compteur en cache Redis invalidé à chaque
     création/lecture, `nt.read` (une, toutes). Tests d'intégration + isolation, bascule `nt.list`, `nt.read`.
  4. **Rappel J-3** — tâche `installments.due-soon` (08:00 locale, module ledger, émet `installment.due_soon`), consommateur
     in-app. Vérif : horloge simulée.
  Choix techniques (option conventionnelle prise) :
  - Un consommateur de notifications ouvre lui-même ses transactions (option `ownTransactions` d'`EventConsumer`) : les
    destinataires se lisent dans le contexte association (`memberships` n'a pas de politique system), l'écriture se fait en
    espace system (`notifications` n'est ouverte qu'au propriétaire et à system). Rejouable grâce à `dedupe_key` unique
    (`ON CONFLICT DO NOTHING`). Aucune politique RLS modifiée.
  - Matrice en code (`notifications/domain/matrix.ts`) d'après le tableau d'`architecture/07` ; un test vérifie que chaque
    événement d'`events.yaml` dont un consommateur est « notifications: … » (lot ≤ 2.5) y figure. `architecture/07` cite une
    section `notification-matrix` d'`events.yaml` qui n'existe pas (signalé dans `a-verifier.md`).
  - Espace courant : `data.audience` (`subscriber` · `manager` · `platform`) ; espace association → audience manager et
    association courante ; souscripteur → audience subscriber ; plateforme → audience platform.
  - « Gestionnaires » destinataires : rôles owner et manager actifs (viewer exclu : il ne peut ni valider ni remettre de code).
  - Liens d'action : ceux d'`architecture/07` (normatif devant les mocks, qui pointent parfois ailleurs).
  - `user.activated` publie encore `associationIds: []` (commentaire « lot 1.2 ») : rempli à l'étape 2.
- **2026-11-03** · lot 2.5, relecture isolation de l'étape 1 (aucune fuite) — à traiter aux étapes suivantes :
  étape 2 : destinataires lus en contexte association seulement (test : un événement de A ne notifie aucun gestionnaire de B) ;
  clé de regroupement des déclarations avec l'association ; `data` par liste blanche de clés par type (jamais code, téléphone) ;
  test du chemin réel `withTenantContext({ space: 'system' })` + `InAppChannel`, et refus RLS du même appel en espace association.
  étape 3 : `nt.list`/`nt.read` filtrés par audience, association courante et appartenance active (test : ancien gestionnaire,
  personne à double rôle) ; `nt.read` ne modifie que `read_at`. Les politiques RLS restent celles de la spec.
- **2026-11-03** · lot 2.5, étapes 2 à 4 — choix faits en autonome :
  - Types d'événement → catégories du front (`app/composables/api/notifications.ts`) : `payment.reverted` → `paiement_declare`
    (la déclaration redevient en attente) ; `member.enrolled`, `user.activated`, `association.request_submitted` → `inscriptions` ;
    `password_reset.requested` → `relance`.
  - Espace courant d'un gestionnaire = sa première appartenance de gestion, comme `GET /me` (pas d'en-tête d'association en V1).
  - Montants : validation → `amountReceived` de l'événement ; rejet et annulation → montant déclaré (immuable) ; rappel J-3 →
    reste dû relu au moment de notifier (`remainingOf`, hors montants en attente : déjà déclaré → aucun rappel).
  - Compteur de non-lus : une clé Redis par personne et par espace (`cotiz:notifications:unread:{userId}:{scope}`, 60 s),
    recensée dans l'ensemble `cotiz:notifications:unread:{userId}` ; invalidation = toutes les clés de la personne, après COMMIT.
  - Rappel J-3 : tâche `installments.due-soon` dans le module ledger (lancée toutes les heures, traite les associations où il
    est 08:00), un événement par souscripteur et par projet ; cloche dédupliquée par `due_soon:{projet}:{date}:{personne}`.
    `dueSoonDate` / `DUE_SOON_DAYS` dans `@cotiz/domain`.
- **2026-11-04** · plan du lot 2.6 (branche `lot/2.6-rapports-dashboard` depuis `origin/backend` c63562b, une seule PR vers
  `backend`, un commit par étape, comme 2.4 et 2.5). Lu : `docs/lots/2.6`, `architecture/09`, `seed-reference.yaml`,
  `endpoints.yaml` (`as.dashboard`, `rp.report`), contrats `association.ts` (`ManagerDashboard`) et `reports.ts`
  (`ProjectReport`), mocks `frontend/server/mocks/{ledger,handlers/association,handlers/projects}.ts`, `jobs.yaml`
  (`managers.digest` 07:30 locale), `events.yaml`, `permissions.yaml` (`reports.read` : owner, manager, viewer).
  1. **Rapport** — `@cotiz/domain` : `collection.ts` (attendu à date, encaissé, reste, taux plafonné à 1, collecte et taux
     cumulé par échéance) + tests ; module reporting : `get-project-report.use-case.ts`, contrôleur `rp.report`
     (`@Can('reports.read')`), inscriptions et échéances par `MemberDirectory` (members.public), dernier paiement validé par
     ledger.public. Tests : intégration (encaissé = Σ allocations confirmées en SQL, mêmes totaux que `lg.grid`, période,
     404 hors association), isolation, bascule `rp.report`.
  2. **Tableau de bord** — `get-manager-dashboard.use-case.ts` (KPI, 6 mois, projets triés par retards avec `stats` réelles,
     5 derniers paiements), cache Redis 60 s par association à génération (modèle `pub.plans`), consommateur worker
     `payment.*`, `member.enrolled|withdrawn`, `activation_code.handed`, `installment.late`. Seed : complément de
     souscripteurs réels (décision 21, `proposé` : « le seed de démonstration génère de vraies inscriptions ») pour atteindre
     les chiffres de `seed-reference.yaml` au 2026-09-25. Test à horloge simulée : 1 240 000 / 1 300 000, 6, 14, 82 %.
     Bascule `as.dashboard`.
  3. **Récapitulatif** — tâche `managers.digest` (toutes les heures, traite les associations où il est 07:30… lancée à :30),
     notification in-app aux owner/manager actifs : paiements à valider, nouveaux retards, codes non remis ; dédupliquée par jour.
  4. **Performance** — `pnpm db:seed:load` (CLI `seed-load`, 50 000 échéances), `EXPLAIN (ANALYZE, BUFFERS)` des requêtes
     du rapport et du tableau de bord, test de perf < 300 ms ; un index absent de `schema.sql` = changement de spec → demander.
  Choix techniques (option conventionnelle prise) :
  - Définitions des chiffres = celles des mocks V0 (référence des maquettes) : attendu = Σ dû des échéances qui comptent
    échues au jour de l'association ; encaissé = Σ versé ; taux = min(1, encaissé / attendu), `null` sans attendu ;
    collecté du mois = Σ allocations confirmées des paiements validés dans le mois (fuseau de l'association) ; attendu du
    mois = Σ dû des échéances du mois. Calculs dans `@cotiz/domain` (règle 2).
  - Rôle `cotiz_readonly` non utilisé (« possible ») : transaction RLS ordinaire de l'association, aucun nouveau rôle de connexion.
  - `stats` des projets du tableau de bord calculées par reporting ; `pr.list`/`pr.overview` restent à zéro (hors lot,
    signalé dans `a-verifier.md`).
