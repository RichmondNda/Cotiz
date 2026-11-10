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
  - Définitions des chiffres (`@cotiz/domain`, `collection.ts`, règle 2) : attendu = Σ dû des échéances qui comptent
    (ni annulées ni dispensées) échues au jour de l'association ; recouvré = Σ versé sur ces échéances ; encaissé = Σ de
    tout le versé (anticipé et échéances annulées compris, = Σ allocations confirmées) ; reste = attendu − recouvré ;
    taux = recouvré / attendu, `null` sans attendu (≠ mocks V0 : encaissé / attendu plafonné, gonflé par l'anticipé ;
    relecture argent 2.6.1). Période du rapport = échéances dont la date tombe dans [from, to] (`inCollectionPeriod`).
    Collecté du mois = Σ allocations confirmées des paiements validés dans le mois (fuseau de l'association) ; attendu du
    mois = Σ dû des échéances du mois.
  - Rapport : inscriptions retirées comprises (totaux, collecte, situations `withdrawn`, lignes) — un retrait n'annule
    que les échéances futures sans versé, l'argent reçu et le dû échu restent ; la grille ne les montre pas (cohérence
    vérifiée sur les inscriptions non retirées). Relecture argent 2.6.1, bloquant 1.
  - Rôle `cotiz_readonly` non utilisé (« possible ») : transaction RLS ordinaire de l'association, aucun nouveau rôle de connexion.
  - `stats` des projets du tableau de bord calculées par reporting ; `pr.list`/`pr.overview` restent à zéro (hors lot,
    signalé dans `a-verifier.md`).
- **2026-11-04** · lot 2.6, étape 2 (tableau de bord `as.dashboard`) — choix pris :
  - Souscripteurs = personnes ayant une inscription active ou terminée (ni retirée ni en attente de signature) ; en retard
    = celles dont une telle inscription est `late` (situation de la grille) ; `activeCount` = souscripteurs. Argent :
    toutes les inscriptions, retirées comprises (comme `rp.report`).
  - Cache : une entrée Redis par association (`cotiz:cache:as.dashboard:<aid>`, 60 s) avec génération par association
    (modèle `pub.plans`) ; invalidée par `member.*`, `payment.*`, `installment.late` (events.yaml « cache: KPI »,
    architecture/09), plus `activation.code_issued|handed`, `user.activated` (`payload.associationIds`) et `project.*`
    (codes à remettre et cartes projet du tableau). Consommateur `manager-dashboard-cache` (worker, ReportingWorkerModule).
  - Reçu par mois : somme SQL des allocations confirmées par mois de validation (fuseau, `GROUP BY` par position : le
    fuseau passé en paramètre ferait deux expressions), additionnée par `monthlyCollection()` (@cotiz/domain).
  - `progress` d'un projet (`collectionProgress`, @cotiz/domain) : règle des mocks V0 — en inscription, souscripteurs /
    requis ; sinon encaissé / (souscripteurs × engagement), plafonné à 1, `null` sans objectif.
  - Contrats non signés > 7 jours : inscriptions `pending_signature` depuis plus de 7 jours (vide avant le lot 4.1).
  - Seed (décision 21) : 47 souscripteurs de démonstration (`shared/dev-seed/reference-crowd.ts`, clés `demo-NN`, téléphones
    `+22507990000NN`, comptes actifs au mot de passe de dev), insérés par les seeds identity/access/members/ledger et
    comptés à part dans la sortie de `seed-dev`. Calibrés sur les nommés (mesurés) pour donner au 2026-09-25 :
    1 240 000 / 1 300 000 F, 6 à valider, 14 retards sur 52, 82 % (`reporting-seed-reference.test.ts`).
- **2026-11-04** · lot 2.6, étape 3 (tâche `managers.digest`) — choix pris :
  - Planification : toutes les heures à la demie (`30 * * * *`), comme `installments.due-soon` ; chaque passage traite
    les associations actives où il est 07:30 ou plus tard (`isManagersDigestTime`, @cotiz/domain), une fois par jour
    local (marque Redis `jobs:managers.digest:<aid>:<jour>`, 48 h, posée après le COMMIT) : rattrapage dans la journée.
  - Contenu : paiements en attente, souscripteurs passés en retard **ce jour** (échéance dont le délai de grâce finit la
    veille : `dueDateTurningLateOn`, `newLateSubscribersOf`), codes d'activation non remis. Tout à zéro → aucune
    notification. Destinataires : owner/manager actifs (`notifiedManagersOf`), comptes notifiables.
  - Type `digest.daily` (nom de la préférence côté front) : absent d'events.yaml (ce n'est pas un événement), donc dans
    `JOB_NOTIFICATIONS` à côté de la matrice ; clé de déduplication `digest.daily:<aid>:<jour>:<personne>`. `data` reste
    dans la liste blanche (`actionLabel`, `digest`), les chiffres sont dans le texte. Front : icône `paiement_declare`.
  - Préférences de notification non appliquées (aucune table de préférences avant le lot qui les porte).
- **2026-11-04** · lot 2.6, étape 4 (performance) — choix de l'utilisateur : « Alléger le code » (sans changer la spec) :
  - Jeu de charge dans `backend/test/perf/reporting-50k.test.ts` (2 000 × 25 = 50 000 échéances, ≈ 27 000 paiements
    validés, insérés en SQL). EXPLAIN (ANALYZE, BUFFERS) : échéances 95 ms (index `installments_enrollment_id_kind_sequence_key`),
    reçus du mois 40 ms (hash join, volumes faibles) : aucun index manquant, `schema.sql` inchangé.
  - Gains (serveur de dev, hors cache) : 1,9 s → ≈ 1,1 s. (1) `parseIsoDate` / `addDays` mémorisés (@cotiz/domain,
    fonctions pures, mémoire bornée à 4 096 entrées, copie rendue) ; (2) statuts calculés une seule fois par l'annuaire
    (`EnrollmentEntry.states`, `computedStates`), réutilisés par `collectionLines` ; (3) échéances lues sans
    `association_id` ni `created_at` (`VIEW_COLUMNS`).
  - Seuils du test : tableau de bord en cache < 300 ms (objectif architecture/09) ; calcul complet < 3 s (garde-fou de
    régression). Reste ≈ 0,25 s de décodage pilote par appel : seule une agrégation en base le réduirait (écartée).
  - `pnpm db:seed:load` (cité par le lot et architecture/09) n'existe pas : le jeu de charge vit dans le test de perf ;
    une commande CLI pour la base de dev reste à faire si on la veut (signalé).
- **2026-11-05** · `chore/projets-indicateurs` (suivi du lot 2.6, accord de l'utilisateur) — choix pris :
  - Calculs dans `reporting` (`application/project-figures.ts` : `summaryWithStats`, déplacé du tableau de bord, et
    `ProjectFigures.withStats`/`overview`), fournis à `projects` par `ProjectFiguresModule` (importe `MembersModule`) via
    `reporting.public.ts` : pas de cycle de modules Nest (members n'importe pas projects en Nest), pas de copie des calculs.
  - Indicateurs calculés pour `pr.list` (projets de la page, `MemberDirectory.entries({ projectIds })`), `pr.get`, et les
    réponses de `pr.patch` et `pr.lifecycle` (publish, close) ; `pr.create`/`pr.duplicate` : aucun souscripteur, zéros
    exacts. L'audit et la comparaison des champs de `pr.patch` restent sur `toProject` (sans indicateurs) ; ETag = version.
  - `pr.overview` : encaissé, attendu, taux comme `rp.report` ; retards, remplissage, prochaine échéance sur les inscriptions
    qui engagent ; `late.count` = souscripteurs en retard (= `stats.lateSubscribersCount`), `late.amount` = Σ reste dû de
    leurs échéances en retard ; `nextDue.expectedTotal` = Σ dû à la prochaine date (`nextDue`, @cotiz/domain, versé
    anticipé non déduit) ; `lateMembers` triés par reste dû décroissant, `lateSince` = plus ancien retard daté comme la
    grille (`installmentView`) ; contrats non signés = toutes les inscriptions `pending_signature` (pas de seuil de 7 jours,
    absent du contrat `ProjectOverview`) ; collecte par échéance inchangée dans sa forme (projet en cours, dates fixes :
    calendrier complet, rangs du projet conservés à l'inscription).
  - Pas de cache : pr.list calcule sur les projets de la page seulement.
  - Relectures argent et isolation, sans bloquant ; repris : `late.amount` = Σ des `lateMembers` (nombre et montant
    d'accord), fusion calendrier × rangs dans `collectionBySequence(échéances, calendrier)` (@cotiz/domain : un rang
    hors calendrier après une modification des dates est conservé), `ProjectFigures` vérifie le contexte de
    l'association, test d'isolation direct (projet de B demandé dans le contexte de A → zéro ; B refusé). Effet visible :
    `stats.progress` d'un projet en inscription avec nombre requis vaut 0 au lieu de `null` (règle du tableau de bord).
  - Reste à faire : `/verifier-ecran` sur `mg-projets`, `mg-projet-overview` et l'accueil gestionnaire (pas de navigateur
    sur le serveur) ; `pending_signature` compté dans l'argent mais pas dans les souscripteurs, à trancher au lot 4.1.

- **2026-11-05** · `chore/compose-tout-docker` — Pile complète dans Docker pour les essais locaux (demande de l'utilisateur).
  - `infra/compose/app.yml`, surcouche de `local.yml` (même projet `cotiz`, mêmes volumes que `pnpm dev`) : `migrate`
    (tâche préalable, cotiz_migrator en direct), `api`, `worker`, `seed` (profil, `seed-dev`), `web` (mocks Nitro conservés
    pour les endpoints pas encore réels, `NUXT_API_ORIGIN=http://api:4000`).
  - `NODE_ENV=development` (clés JWT éphémères, clés de dev) : ce n'est pas le `production.yml` du lot 3.5, qui reste à faire.
  - Front sur le port 3080 par défaut (`COTIZ_WEB_PORT`) : 3000 est pris sur le serveur (Dokploy) et par `pnpm dev`.
  - Correctifs nécessaires à l'image api (jamais lancée jusqu'ici, seulement construite en CI) : `@cotiz/db` compilé
    (`dist/`, mêmes conditions d'export que contracts et domain), garde « lancé directement » de `migrate.ts` en chemin réel,
    `backend/content` copié dans l'image (report du lot 1.3 vers 7.1 traité ici).

- **2026-11-06** · Lot 3.1 (activation, profil, réinitialisations) — plan, une seule PR vers `backend` (comme les lots précédents).
  Dépendance 2.5 `terminé`, décision 2 `adopté`. Aucune migration : `password_reset_requests` a déjà `tenant_manage`
  (lecture et écriture en contexte association) ; notifications « demande de réinitialisation » et « compte activé »
  déjà livrées au lot 2.5 (`notifications/domain/matrix.ts`).
  - Étape 1 · activation : `normaliserCodeActivation` (casse, espaces, tirets → `XXXX-XXXX`) + tests ; souscripteur
    activé → `/bienvenue` ; nom de l'association de `/bienvenue` lu dans `GET /me` (réel) au lieu de `me.assos` (lot 3.2,
    simulé) ; parcours e2e sur le vrai back (code régénéré par Awa → activation → bienvenue → absent des codes à remettre).
  - Étape 2 · `me.profile` : get/patch/password (autres sessions révoquées, session courante gardée, `user.password_changed`,
    audit) ; tests d'intégration et d'isolation ; bascule, handlers simulés supprimés, trois profils revérifiés.
  - Étape 3 · `as.resets` : list/issueCode en contexte association (modèle `pf.resets`), isolation (demande d'une autre
    association → 404) ; page `/asso/souscripteurs/reinitialisations` (modèle `sa-resets`, `HandoffCard`) ; parcours
    oubli → code d'Awa → nouveau mot de passe.
  - Choix sans changer la spec : ~~email pris → `taken`, email non vidable → `required`~~ remplacé (2026-11-06, choix de
    l'utilisateur, faille relevée par `isolation-reviewer`) par **email figé en V1** : un autre email (ou aucun) →
    `validation_failed` (`fields.email = 'not_editable'`), le même → sans effet ; profils mb/mg/sa en lecture seule
    (« Contactez… »), ligne dans `docs/specs/ui-deviations.md` ; outbox : en espace association sans {aid}, seul un
    événement sans association est accepté (`user.password_changed`) ; changement
    de mot de passe : mauvais mot de passe actuel → `invalid_credentials`, mêmes règles `isStrongPassword` que auth.reset.
- **2026-11-06** · Lot 3.1, étape 3 — **rôle le plus élevé** (choix de l'utilisateur, faille d'escalade relevée en
  préparant as.resets : le mot de passe vaut pour tous les espaces, une gestionnaire de A pouvait demander puis émettre
  elle-même le code d'une souscriptrice qui gère B ou fait partie du personnel plateforme).
  - `auth.forgot` (espace souscripteur) : personne qui gère une association (appartenance owner/manager/viewer active ou
    invitée) ou fait partie du personnel → une demande de la plateforme (`space = 'association'`, sans association),
    aucune demande d'association (`request-password-reset.use-case.ts`).
  - `as.resets` issueCode revérifie au moment du code : compte inactif, souscripteur retiré, gestionnaire ailleurs ou
    personnel → demandes de l'association « ignorées », aucun code, 404 (`issue-association-reset-code.use-case.ts`).
  - Code émis par l'association : `one_time_codes.association_id` = l'association (RLS) ; un seul code vaut, le dernier
    émis (CodeService.verify ne lit que lui), même si la RLS empêche d'expirer celui d'une autre association.
  - Écran : tableau et modale de SaReinitialisations extraits dans `components/metier/DemandesReinitialisation.vue`,
    partagés par `/plateforme/reinitialisations` (rendu inchangé) et `/asso/souscripteurs/reinitialisations` ; entrée
    « Réinitialisations » dans l'annuaire (members.manage), à côté de « Codes à remettre ».

- **2026-11-07** · Lot 3.2 (tableau de bord et projets du souscripteur) — plan, une seule PR vers `backend` (comme 3.1).
  Dépendance 3.1 `terminé` (PR #36 fusionnée), aucune décision listée. Aucune migration : politiques `subscriber_*`
  déjà en place (enrollments, installments, payments, allocations, projects, project_payment_methods ; associations
  et moyens de paiement via appartenance active).
  - Module : **reporting** sert `/me/dashboard`, `/me/projects`, `/me/projects/{pid}` en espace subscriber (au départ
    members, abandonné : members → ledger ferait un cycle, ledger important déjà members) ; lectures fournies par
    members (inscriptions et statuts), tenancy (associations, moyens), ledger (paiements vus par le souscripteur),
    projects (projets, moyens retenus) via leurs `*.public.ts`.
  - Étape 1 · `me.dash` : règles dans `@cotiz/domain` (`subscriber-figures.ts` : prochaine échéance d'une inscription,
    synthèse toutes associations, ordre des cartes) + tests ; cas d'usage et contrôleur ; cache Redis 30 s par personne
    (génération, modèle as.dashboard), invalidé par un consommateur du worker sur les événements qui la concernent ;
    test d'intégration au 2026-09-25 sur `seed-dev` : chiffres de `expected.subscriberDashboard_moussa` et cartes
    identiques à `en.list` côté gestionnaire ; bascule `me.dash`.
  - Étape 2 · `me.projects`, `me.project` : échéances ouvertes, échéancier (`installmentView`), paiements liés,
    moyens retenus (consignes du projet), contrat ; tests d'intégration ; bascule, handlers simulés supprimés.
  - Étape 3 · isolation : souscripteur A face aux projets de B (même association, autre association, retiré,
    inconnu) → 404 ; tableau de bord et liste sans ligne de B ; politique affaiblie → le test échoue.
  Choix (option conventionnelle prise) :
  - Seed : Moussa est inscrit à Voyage solidaire **en attente de signature, sans échéance** (seed-reference : « Contrat
    Voyage solidaire à signer » ; décision 20 ; comme les mocks). Avant : inscription active avec échéancier, qui
    donnait 525 000 F restants au lieu de 395 000 F. Aucun chiffre gestionnaire de septembre ne bouge (premières
    échéances de Moussa sur Voyage au 2026-10-05). Une base de dev déjà semée garde l'ancienne inscription.
  - Inscription en attente de signature : engagement calculé par generateSchedule() depuis `startsFrom` (comme les
    mocks), appliqué aussi à la vue gestionnaire (`enrollmentView`) pour garder les mêmes chiffres des deux côtés ;
    exclue du reste total et des retards du tableau de bord (règle des mocks).
  - Inscriptions présentées : non retirées, dans les associations où la personne est souscriptrice active (comme la
    cloche, nt.list).
  - `late.since` d'une carte = date d'échéance du plus ancien retard (« depuis le 5 août », règle des mocks).
  - `contract.required` = inscription en attente de signature (aucune colonne de contrat avant le lot 4.1).

- **2026-11-07** · Lot 3.3 (déclaration de paiement) — plan, une seule PR vers `backend` (comme 3.1 et 3.2).
  Dépendance 3.2 `terminé` (PR #37 fusionnée), décision 6 `adopté` (trop-perçu refusé). Aucune migration : politiques
  `subscriber_declare` (payments), `subscriber_propose` (allocations), `subscriber_pending_update` (installments),
  `owner_access` (files), `append` (outbox, audit) déjà en place (0003, 0012, 0013). Contrats `me.alloc`, `me.declare`,
  `me.payment` déjà écrits (packages/contracts/src/endpoints/me.ts). Module : **ledger** (contrôleur `me/payments`).
  - Étape 1 · `me.alloc` : cas d'usage en espace subscriber (inscription par `subscriberEnrollmentsOf({ projectId })`,
    échéances ouvertes hors attente, `proposeAllocation()`, `amount_exceeds_remaining` + `maxAmount`, `remainingAfter`) ;
    tests d'intégration rejouant `test-vectors/allocation.json` par l'API (échéances semées aux montants du vecteur) ;
    bascule `me.alloc` (le front garde son calcul local, 04-flows § 4.4 « ou »).
  - Étape 2 · `me.declare` : contrôles (inscription du projet sinon 404 ; `pending_signature` → 403 `signature_required` ;
    autre statut, ou projet terminé/archivé → 409 `invalid_state` ; preuve `clean` de la personne sinon `file_not_clean`,
    ni preuve ni référence → `proof_required` ; devise ; `paidOn` pas dans le futur ; moyen retenu du projet), puis
    transaction : paiement inséré **d'abord** (la clé étrangère pose FOR KEY SHARE sur l'inscription : même ordre que
    en.withdraw, inscription → échéances), échéances de l'inscription verrouillées par id et relues,
    `amount_exceeds_remaining`, `validateAllocation()` → `allocationProblem`, allocations `proposed`,
    `moveAllocations({ addPending })` + `writeBalances` (statut `declared`), audit `payment.declare`,
    `payment.declared` { paymentId, projectId, userId, amount }, `checkDeferred()`. Idempotence : intercepteur (Redis)
    + `UNIQUE (user_id, idempotency_key)` (rejeu après 24 h → même paiement). Preuve rattachée à l'association par un
    consommateur du worker (ledger, `ownTransactions`, espace system via `files.public`) : la RLS interdit au souscripteur
    de la rattacher (schema.sql § files). Tests : double envoi → un paiement ; deux déclarations concurrentes sur la même
    échéance → la seconde voit le reste réduit ; isolation (autre souscripteur, autre association, preuve d'autrui).
  - Étape 3 · `me.payment` : statut, répartition (`covered`), motif de rejet, moyen, commentaire ; 404 identique pour
    un paiement d'autrui ; tests d'intégration et d'isolation ; bascule.
  - Étape 4 · front + bout en bout : vrai dépôt de la preuve (fichier gardé en mémoire, pas dans l'état partagé),
    bascule de `fl.upload`/`fl.get` pour l'espace subscriber (nécessaire au dépôt réel, hors liste du lot), handlers
    simulés de `me.alloc`/`me.declare`/`me.payment` supprimés ; parcours Playwright `declaration` sur la pile Docker :
    Moussa déclare 75 000 F (3 échéances) avec photo → Awa valide → 3 cases « Payée » → notification de Moussa.
  Choix (option conventionnelle prise) :
  - Le tableau du lot omet `allocation_exceeds_remaining` pour me.declare ; endpoints.yaml (normatif) le liste : levé.
  - `me.payment` présente un paiement dans les mêmes limites que 3.2 (inscription non retirée, appartenance active) :
    sinon 404.
  - Preuve encore en analyse (`pending`) ou infectée → `file_not_clean` ; inconnue, d'autrui ou rattachée à une autre
    association → 422 `validation_failed` (`fields.proofFileId = 'not_found'`).
  - Étape 1 faite : `openRemainingOf` et `previewAllocation` ajoutés à `@cotiz/domain` (reste dû ouvert, aperçu
    complet ; propriétés fast-check bornées aux totaux sûrs, comme `total_too_large`), utilisés par le cas d'usage et
    le mock ; un montant ≤ 0 est refusé par le contrat (`validation_failed`) avant le domaine (vecteur
    `erreur-montant` vérifié en `invalid_amount` dans le domaine seulement). Aperçu servi aussi sur une inscription
    en attente de signature ou terminée (comme me.project) : me.declare refusera (relevé par `money-reviewer`).
    Plus d'une inscription renvoyée pour un projet → erreur interne (garde-fou, `isolation-reviewer`).
  - Étape 2 faite (me.declare), choix :
    - Écriture des échéances par `writePending` (payment-review) : seuls `amount_pending` et `status`, filtre
      association + `user_id` ; `writeBalances` échouait (500) sur une échéance `late` sans `late_since` (trigger
      `guard_installment_update`, espace subscriber). Test de non-régression.
    - Date du versement après le jour de l'association → `fields.paidOn = 'in_future'` ; moyen inactif, d'une autre
      association ou non retenu par le projet (s'il en retient) → `fields.paymentMethodId = 'not_found'`.
    - Preuve déjà citée par un paiement de la personne dans une autre association (pas encore rattachée) → `not_found`
      (sinon rattachée à la première traitée, illisible pour l'autre).
    - Rejeu par la contrainte (après 24 h) : même projet, montant, date, moyen, référence, preuve et répartition
      déclarée (ordre et casse indifférents), sinon `idempotency_key_reused` (relevé par `money-reviewer`).
    - Ordre des verrous : paiement inséré (FK → KEY SHARE sur l'inscription) puis échéances par id ; pas de verrou sur
      le projet (interdit au souscripteur) ; testé en concurrence avec lg.pay.validate et en.withdraw.
  - Étape 3 faite (me.payment) : lecture filtrée par `user_id` du jeton puis inscription présentée
    (`subscriberEnrollmentsOf`, même association) ; inconnu, d'autrui ou hors limites → même 404. Moyen absent
    (désactivé depuis, ou d'une autre association) → `paymentMethod: null`.
    **Bascule de me.declare et me.payment reportée à l'étape 4**, avec fl.upload/fl.get : basculer me.payment seul
    rendrait 404 sur les paiements déclarés par le mock, et me.declare réel exige une preuve réellement déposée.
  - Relecture `isolation-reviewer` (étapes 2-3), suites données :
    - Même preuve citée **en même temps** dans deux associations : les deux déclarations passaient (course, prouvée
      par un test qui échouait). `subscriberProofOf` verrouille la ligne du fichier (`FOR UPDATE`, permis par
      `owner_access`) : la seconde voit le paiement de la première → 422. Test de concurrence dans `me-declare.test.ts`.
    - 404 de me.declare comparés au corps du projet inconnu ; `payments.subscriber_self_read` élargie dans le test
      d'isolation de me.declare, avec un paiement de Fatou portant la clé envoyée par Moussa (échoue sans le filtre
      `user_id` du rejeu, vérifié par mutation).
    - Écarté : « rejeu sur une ancienne inscription du même projet → 500 » impossible, `UNIQUE (project_id, user_id)`
      sur enrollments (schema.sql) ; verrou `lockInstallments` sans filtre `user_id` (partagé avec lg.pay.*, aucune
      écriture possible sur l'échéance d'autrui : `writePending` filtre `user_id`) laissé tel quel.
  - Étape 4 (front + bout en bout), choix :
    - Contenu de la preuve gardé hors de `useState` (variable du module `useDeclaration`, navigateur seulement) ;
      page rechargée → preuve à rechoisir. Fichier déposé mémorisé par `File` (WeakMap) : un nouvel essai de la même
      déclaration renvoie le même `proofFileId` avec la même clé (sinon `idempotency_key_reused`).
    - Analyse : `complete` attend jusqu'à FILE_SCAN_WAIT_MS ; encore `pending` → nouvelle confirmation (sans effet),
      au plus 3 fois, puis message « encore en cours de vérification ». Erreur d'envoi : titre du Problem (`messageRefus`).
    - Bascule : `me.declare`, `me.payment` (`all`), `fl.upload` pour `subscriber` en plus de `platform` ; `fl.get`
      inchangé (l'espace souscripteur ne lit aucun fichier). Handlers simulés me.alloc/me.declare/me.payment retirés ;
      test d'idempotence générique des mocks déplacé sur `rm.send`.
    - Parcours `souscripteur` (mocks + back réel) : s'arrête au récapitulatif (l'envoi réel changerait les échéances de
      Moussa d'un passage à l'autre). Parcours `declaration` : compte neuf (rejouable) ; son fonds d'entrée (50 000 F,
      plus ancienne échéance) est d'abord déclaré par référence et validé, pour que les 75 000 F couvrent 3 mois comme
      pour Moussa (critère du lot).
    - Pile Docker : `CLAMAV_URL: tcp://clamav:3310` dans `infra/compose/app.yml` (service `clamav`, profil
      `antivirus`) : sans antivirus, un dépôt reste en analyse et la déclaration avec photo est refusée.

- **2026-11-07** · `/lot 3.4` (historique du souscripteur), branche `lot/3.4-historique` — plan exécuté sans validation :
  - Contradiction mineure, tranchée par la hiérarchie : le lot cite « filtres projet, période, statut » ; le contrat
    (`HistoryFilters` : association, projet, période) et la fiche `mb-historique` n'ont pas de filtre de statut → contrat
    suivi, aucun filtre de statut côté API (le front filtre déjà lui-même par statut).
  - **Étape 1 · Historique** (`me.history` list + series) dans `reporting` (comme me.dash) :
    `application/get-subscriber-history.use-case.ts`, `subscriber-space.controller.ts` ; `ledger/subscriber-payments.ts`
    gagne les options période (`paidOn` entre `from` et `to`) et page (curseur `(declared_at, id)` décroissant).
    Sémantique (celle du mock, conforme au contrat) :
    - liste : tous statuts, paiements des inscriptions présentées (mêmes limites que me.payment : non retirée,
      appartenance active), filtrés association / projet / `paidOn` ;
    - `summary.totalPaid` = Σ `amountReceived` des validés de la sélection (= encaissé du gestionnaire pour cette personne :
      Σ allocations = montant reçu à la validation) ; `paymentsCount` = nombre de validés ; `remaining` = reste des
      inscriptions qui engagent, filtré par association / projet (pas par période : la page filtre le reste par projet) ;
    - `series` : validés seulement, mois de `paidOn` ; `cumulative` sur les mois ayant un versement ; `byMonth` par projet ;
      `target` = Σ engagements des inscriptions qui engagent de la sélection, `null` si l'un est ouvert ou sans inscription.
    Tests : intégration `me-history.test.ts` (filtres, page, totaux = `pr.overview`/`rp.report` du gestionnaire pour la
    personne, série), isolation `test/isolation/me-history.test.ts` (politiques élargies). Front : `/bascule me.history`,
    handlers simulés retirés, rendu inchangé (la page calcule déjà synthèse et graphique depuis la liste).
  - **Étape 2 · Justificatifs** : `fl.get` sur le back existe (302, URL de 5 min, audit). Test d'intégration : le
    souscripteur lit sa preuve rattachée à l'association, le gestionnaire de cette association aussi, un autre non.
    Front : `fl.get` basculé pour `subscriber` ~~et `association`~~ (périmètre réduit en cours d'étape : l'affichage de
    la preuve côté gestionnaire est noté dans a-verifier.md), la preuve n'est plus `[URL]` : lecture par le client
    (Bearer) → objet `blob:` affiché par VisionneusePreuve. Écran : feuille « Détail du paiement » de MbHistorique
    (maquette source, non faite en V0) → `DetailPaiementSouscripteur.vue`, lignes de `/historique` en boutons.
    Correctif trouvé à la démonstration Docker : le proxy Nitro suivait la 302 côté serveur vers l'URL signée publique
    (`localhost:9000`, injoignable du conteneur web) → 502 ; il la transmet désormais au navigateur
    (`redirect: 'manual'`, test dans `tests/unit/bascule.test.ts`).
  - Vérification : `pnpm verify` (sous `sg docker`) à chaque étape ; relectures isolation + test-skeptic.
  - Étape 1 faite. Relectures : isolation et argent sans bloquant ; test-skeptic : 6 trous comblés (période sur
    `paid_on` ≠ `declared_at`, validés seuls, reçu ≠ déclaré puis annulation comparés à en.list, série filtrée par
    période et projet, valeurs en dur de la série du jeu de référence, tri des projets d'un mois, reste et objectif
    d'autrui non nuls en isolation, inscription retirée, page 2 sous politiques élargies) ; 5 mutations vérifiées
    détectées (paid_on → declared_at, filtre validated, reçu → déclaré, tri, user_id de subscriberEnrollmentsOf).
    `me-history-ledger.test.ts` à l'heure réelle (fenêtre d'annulation de 10 min sur `now()` de la base) ; `paid_on`
    ≠ jour de déclaration posé déclencheurs suspendus (`guard_payment_update` l'interdit).
  - Ajouts : contrôle « paiement dans la devise du projet » (500 comme me.dash pour plusieurs devises) ; note dans
    `subscriberHistoryFigures` sur l'écart futur avec `enrollmentTotals` (versé d'une échéance dispensée, lot 4.3).
  - Recette `/historique` (pile Docker, vrai back) : rendu conforme ; écarts = base de dev (Voyage actif, 525 000 F,
    a-verifier du 2026-11-07), ordre de juillet identique aux mocks, artefacts de capture des éléments fixes.


- **2026-11-07** · `/lot 3.5` (recette locale du jalon V1), branche `lot/3.5-jalon-v1` (depuis `origin/backend`, cf37f4e) —
  dépendance 3.4 `terminé` ; aucune décision listée. Plan exécuté sans validation :
  - **Étape 1 · Parcours complets** : nouveau parcours `jalon` dans `frontend/tests/e2e/parcours.mjs`, sur une association
    neuve à chaque passage (nom et numéros tirés au hasard) : demande publique → Richy approuve (`/plateforme/demandes`,
    code remis par HandoffCard) → la responsable active son compte et fait l'onboarding (`/asso/bienvenue`) → crée un
    projet (`/asso/projets/nouveau`) → inscrit un souscripteur (code remis) → activation → déclaration couvrant plusieurs
    échéances avec preuve → validation → notification du souscripteur. Briques existantes (`nouveauCompte`, `declarer`,
    `valider`) paramétrées par association/projet/compte gestionnaire. Vérif : vert sur la pile Docker (`app.yml`, api et
    worker réels, `--profile antivirus`).
  - **Étape 2 · Sans fournisseur** : test d'acceptation `backend/test/integration/no-provider.test.ts` : le schéma de
    configuration n'accepte aucune variable de canal externe (liste de `features.yaml` `externalProvider`), `GET /me`
    n'annonce aucune fonctionnalité `externalProvider` ; le parcours `jalon` lancé avec un environnement vérifié sans ces
    variables (script `tools/sans-fournisseur.mjs` : refuse de démarrer si une variable SMTP/SMS/PAY/PUSH… est définie).
  - **Étape 3 · Charge et sécurité** : scripts k6 dans `infra/load/` (grille 200 × 24, tableau de bord, 100 déclarations,
    2 validations concurrentes) contre la pile locale, jeu de charge `pnpm db:seed:load` ; objectifs de
    architecture/09 (lectures p95 < 300 ms, écritures < 800 ms, grille < 500 ms). ZAP baseline (image officielle
    `ghcr.io/zaproxy/zaproxy:stable`, k6 : `grafana/k6`, versions épinglées : sources vérifiées, rien installé sur le poste)
    ; revue des en-têtes et de la CSP (front Nitro et api). Vérif : objectifs tenus, aucune alerte ZAP haute.
  - **Étape 4 · Répétition de production** : `infra/compose/production.yml` (migrate en tâche préalable, api, worker, web
    `NUXT_MOCKS=0`, `NODE_ENV=production`, configuration par variables `${VAR:?}` uniquement) + surcouche locale
    `production.local.yml` (services de données locaux, ports) ; secrets de la répétition générés à la volée par
    `infra/compose/production-local.sh` (clés JWT et de chiffrement éphémères, jamais écrites dans un fichier `.env`).
    Front : en build sans mocks, fonctionnalités = celles de `GET /me` seulement (plus de tolérance « lot non basculé »)
    ; écrans et zones des lots ≥ 4 → « Bientôt disponible » (architecture/10, « Fonction pas encore livrée ») ;
    `DELIVERED_FEATURES` complété (`payments` 3.3, `activation_codes` 2.3 manquaient). Vérif : `/health/ready` 200, parcours
    `jalon` vert sur cette pile, revue des écrans V1 sans aucune donnée simulée.
  Écarts avec la réalité du dépôt (option conventionnelle prise) :
  - « images construites par la CI » : la CI ne tourne plus (depuis le 2026-11-05) → images construites en local avec les
    mêmes Dockerfiles (`infra/docker/*.Dockerfile`), étiquettes `cotiz-*:prod-local`.
  - `me.assos` (lot 4.5) sert des écrans V1 (`/associations`, nom de l'association dans le détail d'un paiement) : en build
    sans mocks, `/associations` affiche « Bientôt disponible » ; le détail d'un paiement prend le nom porté par le paiement
    (`SubscriberPayment.association`, déjà au contrat) au lieu de me.assos.
  - Étape 1 faite (2026-11-08) : parcours `jalon` vert sur la pile Docker (10 étapes, association neuve, paiement de
    100 000 F couvrant fonds d'entrée + 2 mois avec preuve, validé, notifié). Deux défauts réels trouvés et corrigés :
    (1) rendu serveur des pages publiques cassé dans toute image Docker : `useClient` appelait l'origine publique de la
    requête (`localhost:3080`, injoignable dans le conteneur ; détour par Internet en production) → `event.fetch` local de
    Nitro (« Les plans n'ont pas pu être chargés » sur `/demande`) ; (2) `chargerAssociation` appelait `tm.team` (lot 4.5,
    simulé : 404 pour une association réelle, et en production) → quotas de `bl.sub` (réels). Reste toléré sur la pile de
    dev seulement (`COTIZ_STRICT=1` l'interdit) : `ct.get` (lot 4.1) appelé par la fiche projet, à filtrer par
    fonctionnalité à l'étape 4. Reprise sans nouvelle demande (5/h par IP) : `COTIZ_JALON_REPRISE=<email>`.
  - Étape 2 faite (2026-11-08) : `backend/test/acceptance/sans-fournisseur.test.ts` (schéma de configuration — `ConfigSchema`
    exporté —, fonctionnalités `externalProvider` jamais annoncées même livrées, fichiers compose, dépendances npm, hôtes
    tiers dans le code livré ; 3 mutations vues échouer : `SMTP_HOST` dans app.yml, `nodemailer`, URL Google Fonts) ;
    liste unique `backend/test/acceptance/fournisseurs.ts` (un `.mjs` dans `tools/` cassait le projectService d'ESLint) ; recette `tools/sans-fournisseur.mjs` (`docker inspect` des conteneurs api,
    worker, web — noms seuls, jamais les valeurs — puis parcours `jalon`) verte sur la pile Docker. Un « Failed to fetch
    dynamically imported module » vu une fois (navigation pendant un chargement), absent au passage suivant.
  - Étape 3 faite (2026-11-08), pile Docker, poste partagé (ClickHouse et d'autres services hors Cotiz chargent le CPU,
    charge moyenne 4 à 8 sur 8 cœurs : chiffres indicatifs).
    · **En-têtes** : front `server/securite/entetes.ts` + plugin Nitro (fonctions pures testées, `tests/unit/securite.test.ts`) :
    CSP à nonce par requête pour `<script>` et `<style>` (`style-src-attr 'unsafe-inline'` seul permis en ligne : attributs
    `style` des composants), `connect-src` limité au stockage (`NUXT_STORAGE_ORIGIN`) et à GlitchTip, `frame-ancestors 'none'`,
    X-Frame-Options DENY, nosniff, Referrer-Policy, COOP, CORP, Permissions-Policy ; pas de CSP en dev (HMR). Api :
    `x-powered-by` retiré, nosniff, DENY, `no-referrer`, CSP `default-src 'none'` (test `health.test.ts`). HSTS : Traefik (7.1).
    · **ZAP baseline** 2.16.1 (`infra/securite/.rapports/`, ignoré) : 0 FAIL, 62 PASS, aucune alerte haute ni moyenne. Reste
    une basse acceptée : 90004 (pas de `Cross-Origin-Embedder-Policy`) — `require-corp` bloquerait les images signées du
    stockage (autre origine), et l'app n'utilise pas `SharedArrayBuffer`. Le reste est informatif.
    · **k6** 1.0.0 (`infra/load/charge.js`, jeu `preparer.mjs` par l'API, api relancée avec
    `COTIZ_RATE_LIMIT_ENDPOINT_PER_MIN=1000` le temps de préparer, puis remise à 20) : lecture retenue des objectifs
    d'architecture/09 = p95 **par requête à charge nominale**, scénarios successifs ; les 100 déclarations simultanées
    d'architecture/12 = robustesse (toutes acceptées, aucune expiration). Le pool de 10 connexions les met en file : une
    déclaration seule ≈ 185 ms, en rafale médiane ≈ 3 s, max 5,5 s. Résultats : grille (1 gestionnaire, pages de 100 lignes,
    comme test/perf du lot 2.4) p95 252 ms, 2 gestionnaires 274 ms ; tableau de bord p95 147 ms ; 100 déclarations à 5 en
    parallèle p95 703 ms ; rafale 100/100 en 201 ; 2 validations distinctes 200, même paiement 200 + 409 (aucun interblocage),
    p95 242 ms ; 0 refus inattendu. La grille recalcule tout le projet à chaque page (O(inscriptions)) : voir a-verifier.md.
  - Étape 4 faite (2026-11-08) : `infra/compose/production.yml` (celui du lot 7.1 : images par variable, secrets en
    `${VAR:?}` sans défaut, NODE_ENV=production, `migrate` en tâche préalable, ClamAV exigé, aucun port publié) +
    `production.local.yml` (ports 127.0.0.1 : web 3090, api 4090, MinIO 9090 ; limite par IP relevée à 5000 : une seule
    IP sur le poste, 300/min coupait le parcours) ; rôles PostgreSQL par `postgres-init-production/00-roles.sh`
    (`\getenv`, mots de passe jamais en argument) puis `postgres-init/01-roles.sql`. Recette `tools/repetition-production.sh` :
    images construites en local (CI arrêtée ; front `--build-arg NUXT_MOCKS=0`), secrets générés en mémoire à chaque
    lancement (aucun fichier `.env`), projet compose `cotiz-prod` séparé, mots de passe des rôles remis sur un volume
    existant, owner plateforme neuf (`create-platform-owner`, code jamais affiché), plan Découverte créé par `pf.plan.write`
    s'il manque (base neuve : aucun plan), puis `/health/ready` (200) et parcours `jalon` en `COTIZ_STRICT=1` : vert.
    Choix front : build sans mocks = constante `__COTIZ_MOCKS__` (vite.define, fixée au build comme nitro.ignore) ;
    `endpointDisponible(id, espace)` (utils/bascule.ts) : sans mocks, seuls les endpoints du registre existent ;
    fonctionnalités = `GET /me` seul ; `ct.get` appelé seulement si `contracts` est active ; `contexteSouscripteur` sans
    `me.assos` (lot 4.5) prend les associations des cartes et les moyens de `me.project`. Back : `DELIVERED_FEATURES`
    complété (`payments`, `activation_codes`). Rendu de dev inchangé (parcours de la pile Docker verts).


- **2026-11-08** · `/lot 4.1` (contrats et génération PDF), branche `lot/4.1-contrats-pdf` (depuis `origin/backend`, c11da64)
  — dépendance 3.5 `terminé` ; aucune décision listée (décision 20, `proposé` : échéancier généré à la signature).
  **Tranché par l'utilisateur** (contradiction architecture/04 § 4.7 ↔ events.yaml, consommateur « ledger : génération de
  l'échéancier » de `contract.signed`) : d'abord « synchrone », puis, la RLS cible l'empêchant (en espace subscriber,
  `installments` n'a que SELECT/UPDATE ; `files.owner_access` ne couvre que `payment_proof`), **asynchrone, conforme à la
  spec** : transaction souscripteur = signature (`subscriber_sign`) + inscription `active` (`guard_enrollment_update`) +
  `contract.signed` ; ligne `files` du PDF créée juste avant en espace system ; consommateur système idempotent de
  `contract.signed` = échéancier (quelques secondes ; le front attend avant de proposer la déclaration). Aucune politique
  RLS touchée. Correction d'architecture/04 § 4.7 (« échéancier généré » → par le worker) proposée dans la PR.
  Choix pris en autonome (conventionnels, à relire dans la PR) :
  - « Le projet exige un contrat » = une ligne `contracts` existe pour le projet (`project_id UNIQUE`, saisie à l'étape 5
    de la création ou par `ct.get` PUT) ; aucune colonne ajoutée à `projects`. Les mocks font pareil (`contractRequired`).
    Une inscription créée alors → `pending_signature` sans échéance (décision 20) + `contract.signature_required`.
  - Signer suppose un contrat **verrouillé** (signé par l'association) : avant, `me.contract` montre le texte
    (`associationSigner.signedAt: null`) et `me.sign` répond 404 `not_found` (aucun code dédié dans errors.yaml).
  - `contract_signatures.pdf_file_id NOT NULL` alors que le PDF est produit après coup par le worker : à la signature,
    ligne `files` `pending` (purpose `contract_pdf`, bucket `cotiz-legal`, taille 0), complétée par le worker
    (`sha256`, taille, `clean`). Un PDF déjà `clean` n'est jamais régénéré.
  - `ProjectContract.pdfFileId` (ct.get) : aucune colonne de PDF au niveau du contrat dans schema.sql → `null`.
  - Rendu du texte (variables `{association}`, `{nom_souscripteur}`, `{telephone}`, `{projet}`, `{montant}`, `{fonds_entree}`,
    `{nb_echeances}`, `{frequence}`, `{montant_echeance}`, `{jour}`, `{date_debut}`, celles des mocks et du front) dans
    `@cotiz/domain` (pur, partagé avec le front) ; SHA-256 côté back.
  Plan :
  - **Étape 1 · Tables** : migration `0015_contracts.sql` (tables, FK, `contracts_locked`, `signatures_append_only`,
    `signatures_no_truncate`, RLS + politiques souscripteur, `REVOKE UPDATE, DELETE`), schéma Drizzle
    `packages/db/src/schema/contracts.ts`. Tests d'invariants (`packages/db`) : mise à jour d'un contrat verrouillé →
    `contract_locked`, UPDATE/DELETE/TRUNCATE d'une signature refusés, isolation RLS des deux tables, politiques
    souscripteur (lecture de ses signatures, insertion pour soi seulement). Conformité au schéma cible.
  - **Étape 2 · Éditeur** : `@cotiz/domain` `renderContract()` (tests d'abord) ; module back `contracts` : `ct.get`
    (lecture, PUT du modèle, `lock` = signature de l'association + `template_sha256` + `contract.locked`), `ct.list` ;
    `pr.create` accepte `contract` ; garde de fonctionnalité `contracts` (plan) → `feature_disabled` ; `en.create` →
    `pending_signature` si contrat. Tests d'intégration : `contract_locked` après verrouillage, `version_conflict`,
    permissions, isolation HTTP (404 entre associations), plan sans `contracts`.
  - **Étape 3 · Signature** : `me.contract` (texte rendu + SHA-256), `me.sign` (Idempotency-Key, empreinte comparée,
    consentement exact, IP et navigateur, inscription `active` + échéancier dans la même transaction, `contract.signed`,
    audit ; échéancier par le consommateur système), notifications (`contract.signature_required`, `contract.locked`, `contract.signed`). Tests :
    `contract_changed`, `already_signed`, double envoi, `signature_required` avant déclaration, isolation souscripteur.
  - **Étape 4 · PDF** : `packages/pdf-templates` (contrat + page de preuve, polices @fontsource embarquées, charte),
    file `documents` (concurrence 2) → Gotenberg (`GOTENBERG_URL`, service ajouté à app.yml et production.yml) →
    `cotiz-legal` ; `me.contracts`. Front : bascule des 5 endpoints, handlers simulés supprimés, `DELIVERED_FEATURES`
    + `contracts`, `/verifier-ecran` des 4 écrans, parcours e2e « contrat ». Vérif : PDF identique octet pour octet à
    chaque téléchargement (empreinte = `files.sha256`), page de preuve présente.
  Sous-agents `isolation-reviewer` (étapes 1 à 3) et `test-skeptic` en fin d'étape.
- **2026-11-08** · Lot 4.1, étape 1 — **changement de `docs/specs/schema.sql` accordé par l'utilisateur** (revue
  `isolation-reviewer`) :
  (a) PDF signé : l'api ne peut créer la ligne `files` du PDF dans aucun espace (`owner_access` = `payment_proof`
  seulement, espace system réservé au worker par `tenant-database.ts`) → politiques `files.subscriber_contract_pdf_read`
  (SELECT) et `subscriber_contract_pdf_create` (INSERT en attente, association où il est inscrit) ; fichier et signature
  dans la même transaction souscripteur ;
  (b) resserrement : clé composite `contracts (project_id, association_id) → projects`, `e.association_id` dans
  `contracts.subscriber_enrolled_read`, `subscriber_sign` lié à son inscription `pending_signature`, au contrat verrouillé
  du même projet et à son PDF `contract_pdf` de la même association, `UNIQUE (enrollment_id)` et `UNIQUE (pdf_file_id)`.
  Reportés dans la migration 0015 (non encore commitée) et `data-model.md`. Ordre imposé à `me.sign` (étape 3) :
  fichier, puis signature (inscription encore en attente), puis inscription `active`.
- **2026-11-08** · Lot 4.1, étape 1 — **second resserrement accordé par l'utilisateur** (2e passe d'`isolation-reviewer`) :
  `contract_signatures.subscriber_insert_only` (RESTRICTIVE, INSERT en espace subscriber seulement : un gestionnaire ne
  signe pas à la place d'un souscripteur ni ne bloque une inscription d'une autre association par UNIQUE ; politique
  restrictive plutôt que `tenant_isolation FOR SELECT`, que le garde-fou `auditTenantSecurity` refuse) ; création du PDF
  à la clé imposée (`cotiz-legal`, `{association}/contract_pdf/{id}.pdf`, sans expiration) et seulement avec une
  inscription `pending_signature` ; `subscriber_sign` exige un PDF neuf (`pending`, sans empreinte). Test d'isolation : 69 cas.
- **2026-11-08** · Lot 4.1, étape 2 — **tranché par l'utilisateur** : (a) `contracts.version int NOT NULL DEFAULT 1`
  (changement de schema.sql, migration 0016 : 0015 est commitée) → If-Match réel sur PUT et lock (`version_conflict`) ;
  (b) `ct.get` garde `@Can('association.read')` (contrat), mais PUT et lock exigent en plus `projects.manage` dans le cas
  d'usage (owner, manager ; viewer → 403 `forbidden`) ; à proposer dans la PR pour permissions.yaml.
- **2026-11-08** · Lot 4.1, étape 2 — choix pris en autonome (à relire dans la PR) :
  - Signatures de ct.get / ct.list : `signed` = lignes `contract_signatures` du contrat ; `total` = `signed` + inscriptions
    `pending_signature` du projet (une inscription retirée, ou née active avant le contrat, n'est pas comptée). Les mocks
    comptaient toute inscription non en attente comme signée.
  - Fonctionnalité `contracts` : vérifiée sur le **plan** de l'abonnement en cours (`billing.planFeaturesOf`, lu en base
    sous RLS), pas sur `DELIVERED_FEATURES` (ajoutée à l'étape 4, au moment de la bascule front) ; ct.get, ct.list et
    pr.create avec contrat → 403 `feature_disabled`. en.create ne la vérifie pas : un contrat existant reste à signer
    même si le plan change. `GET /me` reste à `planFeatures: null` jusqu'à l'étape 4 (les routes `/me` n'ont pas
    d'association dans leur contexte : à résoudre à la bascule).
  - PUT d'un projet sans contrat : 404 (comme les mocks) ; le contrat se crée avec le projet (pr.create, étape 5 de
    l'assistant). Verrouillage : `associationSignedAt = lockedAt = now()`, `templateSha256` recalculée.
  - ct.list : tri unique (le plus récent d'abord), tout `sort` → 422 ; « non signés > 7 jours » = `joined_at` antérieur
    de plus de 7 jours.
  - en.create sous contrat : `pending_signature`, `activated_at` NULL, aucune échéance, `contract.signature_required`
    (émis par une fonction de `contracts.public`, émetteur `contracts` d'events.yaml) ; en.bulk hérite (même cas d'usage).
  - Revue `isolation-reviewer` (étape 2) : aucun bloquant ; ajoutés les tests jeton souscripteur et `aid` = B (garde
    d'appartenance, 404 sur les 4 routes). Corrigé : `schedule.extend-rolling` prolongeait aussi les inscriptions
    `pending_signature` (tout l'échéancier depuis `startsFrom`) → `RUNNING = ['active']` (test d'abord, vu échouer).
  - Revue `money-reviewer` (étape 2) : aucun bloquant ; tests en.create renforcés (statut `active` + `activated_at`,
    montants d'une inscription en attente, cycle roulant sous contrat, rejeu Idempotency-Key). À reprendre à l'étape 3 :
    consommateur `contract.signed` = insertion `onConflictDoNothing (enrollment_id, kind, sequence)` (une extension
    roulante a pu passer entre-temps), verrous projet → inscription → échéances, me.declare refusé proprement tant que
    l'échéancier n'existe pas, signature tardive d'un cycle roulant (rattrapage `late`). Question posée à l'utilisateur
    (spec) : figer les conditions financières au verrouillage du contrat (`a-verifier.md`).
- **2026-11-08** · Lot 4.1 — **accordé par l'utilisateur** (« D'accord, fige les conditions au verrouillage ») :
  `domain-rules.md` § 9 — `financial_terms_locked_at` posé aussi au verrouillage du contrat (ct.lock, pr.create avec
  `signNow`), une seule fois (la première date gardée ; lg.pay.revert ne libère que des conditions figées par ce
  paiement : inchangé). ct.lock verrouille le projet (FOR NO KEY UPDATE) puis le contrat : ordre d'en.create.
- **2026-11-08** · Lot 4.1, étape 3 (signature) — choix pris en autonome (à relire dans la PR) :
  - me.sign, espace subscriber, une transaction : inscription relue FOR UPDATE (`subscriber_sign_update` ; projet et
    contrat non verrouillables par le souscripteur — aucune politique UPDATE —, mais contrat verrouillé immuable et
    conditions figées) ; déjà signée → 409 `already_signed` (aussi ON CONFLICT sur `enrollment_id`) ; inscription qui
    n'attend pas de signature, ou contrat pas encore verrouillé → 404 ; empreinte ≠ texte rendu → 409
    `contract_changed` ; puis `files` (PDF `pending`, clé `{aid}/contract_pdf/{id}.pdf`, `cotiz-legal`), signature
    (consentement exact du mock, IP si valide, navigateur), inscription `active`, `contract.signed`, audit
    `contract.sign`. Rejeu : intercepteur (24 h) ; au-delà, `already_signed`.
  - Échéancier : `members/events/contract-schedule.consumer.ts` (espace system, `contract.signed`) : projet FOR SHARE →
    inscription FOR SHARE → insertion ON CONFLICT DO NOTHING, statuts au jour de l'association (rattrapage) ;
    inscription retirée ou inconnue : rien. Quelques secondes « active sans échéance » entre la signature et le
    consommateur (montants à 0 sur les écrans pendant ce temps) : accepté.
  - me.contract : `pdfFileId` seulement quand le PDF est `clean` (étape 4) ; `{montant}` d'un cycle roulant = une
    échéance (le mock additionnait l'horizon) ; téléphone absent : « non renseigné » (mock : « +225 [XX XX XX XX] »).
  - Notifications (in-app seulement, matrice) : `contract.signature_required` → le souscripteur si le contrat est déjà
    verrouillé (sinon `contract.locked` l'avertira) ; `contract.locked` → souscripteurs en attente ; `contract.signed`
    → gestionnaires, lien `/asso/projets/:id/contrat`. Souscripteur : `/projets/:id/contrat`.
  - Reste pour l'étape 4 : `Enrollment.contractSignedAt` (toujours `null` dans les vues gestionnaire) à remplir à la
    bascule des écrans ; proposition de correction d'architecture/04 (§ 4.3 l. 22, § 4.7) et décision 20 → adopté.
- **2026-11-08** · Lot 4.1, étape 4 (PDF, partie back) — choix pris en autonome (à relire dans la PR) :
  - `packages/pdf-templates` : `contractDocument()` (contrat + page de preuve, tout texte échappé, polices @fontsource
    Poppins 600/700 et Inter 400/600 jointes, couleurs de cotiz-tokens.css, « 1er » du mois) ; build `dist` comme
    `@cotiz/domain` (image Docker).
  - Module back `documents` (worker seulement, events.yaml « documents : PDF signé ») : `contract.signed` → job
    `contract-pdf` (jobId = événement) de la file `documents` (concurrence 2, 8 tentatives, 5 s exponentiel) ;
    génération : contexte association (texte rendu à nouveau par `renderedContractOf`, partagé avec me.contract, et
    comparé à l'empreinte signée — sinon erreur, jamais de PDF d'un autre texte), rendu Gotenberg hors transaction, puis
    espace system : `files` FOR UPDATE, objet écrit **une seule fois** (`If-None-Match: *` ; objet déjà présent après un
    COMMIT perdu = celui qui fait foi), `files` complété (`clean`, sha256, taille). Sans `GOTENBERG_URL` (exigée en
    production) : rendu refusé, PDF en attente.
  - Téléchargement : souscripteur par fl.get (`findFile` : `contract_pdf` lisible en espace subscriber, propriétaire
    revérifié dans le code) ; gestionnaire par as.file (`/associations/:aid/files/:id`, décision 24). fl.upload ›
    complete refuse (404) un usage qu'on ne dépose pas depuis son espace (le PDF de contrat).
  - me.contracts : à signer (inscription `pending_signature`) puis signés ; `pdfFileId` une fois `clean`.
  - `Enrollment.contractSignedAt` : `contractSignedAtOf` ; espace plateforme : aucune politique de
    `contract_signatures` → toujours `null` (sans lecture).
  - Gotenberg : `app.yml`/`production.yml` (`GOTENBERG_URL`, service interne non publié, `--chromium-allow-list` :
    fichiers envoyés seulement) ; test réel hors `pnpm verify` : `pnpm --filter backend test:gotenberg`.
  - Accord de l'utilisateur (2026-11-08, « ok pour les deux, fais comme tu recommandes ») :
    - `contract_signatures.rendered_body` (migration 0017, `schema.sql`, `data-model.md`) : texte signé figé ; le PDF
      reprend ce texte (contrôle sha256 = `rendered_sha256`), plus de nouveau rendu : un renommage ultérieur (projet,
      association, souscripteur) ne change plus le document.
    - `GET /me` en espace association : MembershipGuard pose l'association courante (première gérée, même choix que
      GetMe) pour l'endpoint `me` seul ; `features` = livrées ∩ plan de cette association. `contracts` livrée
      (`DELIVERED_FEATURES`). Les autres routes `/me/…` restent sans association.
- 2026-11-08 · Correctif demandé par l'utilisateur (« la vue retournée n'est pas la bonne » pour l'activation du
  compte association) : le lien du message prêt d'un gestionnaire (`buildHandoff`, espace association) était
  `/activer?t=<téléphone>` → vue souscripteur (téléphone). Désormais `/activer?espace=association` (plateforme :
  `?espace=plateforme`), sans téléphone ni email ; souscripteur inchangé (`?t=`). Exemple de `architecture/03` à
  compléter (proposition, docs non modifiés).
  - Revue d'isolation (2026-11-08) : `GET /me` ne compte plus dans le quota de l'association (le quota `aid:` ne vaut
    que pour les routes de l'espace association ; test `rate-limit.interceptor.test.ts`). Association courante
    suspendue : `GET /me` rend les fonctionnalités de son plan, comme le choix de l'association courante du lot 1.2 ;
    les routes `/associations/{aid}/…` restent en 403 `association_suspended`.
- 2026-11-08 · Lot 4.1, étape 4, partie front (« ok continue avec la partie front ») :
  - Bascule de `ct.get`, `ct.list`, `me.contract`, `me.sign`, `me.contracts` ; leurs 7 routes simulées et handlers
    supprimés (test de conformité des mocks : plus d'écriture simulée à If-Match, assertions version_conflict retirées).
  - Assistant de création de projet : étape « Contrat » affichée si `contracts` est active (`GET /me`), 6 étapes ; sinon
    5 (`etapesProjet(avecContrat)`). L'écart temporaire de `ui-deviations.md` (« Création de projet, lot 2.2 ») est
    donc levé : proposer sa suppression dans la PR (docs non modifiés).
  - « Télécharger le contrat signé » (souscripteur) : PDF du serveur (`pdfFileId` de me.contract, `fl.get`) ; pas
    encore produit : nouveau chargement, puis bandeau « en cours de préparation ». Gestionnaire : impression du modèle.
  - `monContrat` : seul un 404 vaut « pas de contrat » (les autres erreurs remontent).
  - Parcours e2e `contrat` (pile réelle, `COTIZ_BASE=http://localhost:3080`) : projet avec contrat (ou repris : quota
    du plan), inscription, activation, signature, PDF `%PDF-`, Mes contrats, Contrats du gestionnaire — 9/9.
- 2026-11-08 · Durée des tests back (« oui, lance le point 1 »), branche `chore/tests-rapides` :
  - Mesures (sonde jetable) : par fichier, conteneur PostgreSQL ≈ 5 s, migrations ≈ 2 s, Redis ≈ 1 s, arrêt ≈ 1 s ;
    `h.superuser()` ouvrait une connexion par requête (≈ 40 ms, contre ≈ 3 ms réutilisée), `resetMembers()` ≈ 750 ms
    par test ; `CREATE DATABASE … TEMPLATE` d'une base migrée ≈ 155 ms.
  - Point 1 fait : `superuser()` et `migrator()` du harnais (`test/isolation/harness.ts`) passent par un `pg.Pool` par
    URL, fermé dans `stop()` ; connexion détruite après une erreur (texte `BEGIN; …; COMMIT;` de rls-smoke qui échoue).
    `superuserRollback` et `countWithoutTenantDatabase` gardent une connexion neuve. Mesuré : enrollment-create +
    ledger-validate + isolation/ledger, 88 s → 54 s ; `pnpm verify` vert, 1 212 s au total (back 1 003 s, 151 fichiers).
  - Fichiers les plus longs ensuite : association-requests (114 s : défi ALTCHA résolu à chaque dépôt, compteur codé
    en dur `randomInt(10_000, 5_000)` dans `altcha.service.ts`, ALTCHA_COST=1 n'y change rien) et cli-platform-owner
    (97 s : CLI lancée en sous-processus, deux fois par test).
  - ALTCHA (« oui, enchaîne avec ALTCHA puis le point 2 »), branche `chore/tests-altcha` : `ALTCHA_COUNTER_MAX`
    (10 000 par défaut, ≥ 2, compteur tiré dans [max/2 ; max], production inchangée), 20 dans association-requests :
    114 s → 30 s.
  - Point 2, branche `chore/tests-postgres-partage` : `globalSetup` vitest qui démarre un PostgreSQL (max_connections
    500) et migre la base modèle ; le harnais copie le modèle par fichier (`CREATE DATABASE … TEMPLATE`) puis rejoue
    la partie « base » de 01-roles.sql (propriétaire, REVOKE TEMPORARY, schéma public), que la copie perd — pas ses
    ALTER ROLE, globaux au serveur (conflits entre fichiers). Test ajouté dans harness.test.ts (échoue sans).
    Repli sur un conteneur par fichier si Docker manque au démarrage ou COTIZ_TEST_SHARED_PG=0. Les fichiers qui
    démarrent eux-mêmes leur base (tenant-context avec PgBouncer, metrics, outbox, worker-tenant-context, @cotiz/db)
    ne changent pas. maxWorkers local 2 → 4. `pnpm verify` 1 212 s → 631 s, back 1 003 s → 420 s.
  - cli-platform-owner (« oui, occupe-toi de cli-platform-owner et Redis »), branche `chore/tests-cli`, PR #51 : la CLI
    tourne dans le processus du test (pas de sous-processus) ; coût = 12 passes de seed-dev, dont SeedDevPayments
    (3 requêtes × 276 paiements même déjà présents) et l'audit ligne par ligne. Lectures groupées une fois par
    exécution (échéances toujours relues FOR UPDATE par paiement) + @Audited en une instruction (paquets de 500).
    money-reviewer et isolation-reviewer : aucun défaut. Fichier 98 s → 50 s ; `pnpm verify` inchangé (634 s) : ce
    fichier n'était pas le chemin critique à 4 fichiers à la fois. SeedDevMembers laissé (≈ 1 s, verrous share).
  - Redis partagé : écarté par l’utilisateur le 2026-11-08 (« Ne pas le faire »). Gain estimé ≈ 9 s sur 420 s (≈ 1 s × ≈ 35 fichiers / 4) ; 31 appels
    `redis-cli` dans le conteneur dont 17 FLUSHALL (effaceraient les autres fichiers), sorties texte relues (TTL,
    EXISTS) ; health et redis-client arrêtent Redis exprès.

## 2026-11-10 · PR C (règles produit), étapes 3 et 5
- Historique d'un projet quitté : paiements et contrat signé gardés en lecture seule (`enrollmentWithdrawn`), sur
  demande de l'utilisateur (« que recommande tu ? fais le »). Association quittée : hors périmètre (politique RLS, question posée).
- Courbe de l'historique filtrée par période : cumul depuis le début des projets. Recommandation appliquée **sans
  réponse de l'utilisateur** (point « courbe filtrée » laissé sans réponse) ; à confirmer. Source :
  `packages/domain/src/subscriber-history.ts`.
