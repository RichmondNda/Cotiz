# À vérifier par un humain

Format : **date** · point — constat, source · ce qui est attendu. Une fois tranché : déplacer dans « Tranché », avec la réponse.

## Points ouverts


- **2026-11-03** · `architecture/07-notifications.md` renvoie à une section `notification-matrix` de `specs/events.yaml` qui
  n'existe pas — la matrice est le tableau d'`architecture/07` (cohérent avec les consommateurs d'`events.yaml`). Lot 2.5 :
  matrice en code + test contre `events.yaml`. · Ajouter la section à `events.yaml` ou corriger le renvoi (au choix).

- **2026-11-05** · CI GitHub Actions plus exécutée (plus de minutes, dit l'utilisateur : « on va aller à l'aveugle
  coté CI ») : PR #31 et suivantes sans vérification (`gh pr checks` : « no checks reported »). Seule porte :
  `pnpm verify` local (mesures de durée à part : `pnpm test:perf`, voir Tranché). Non couverts en local : parcours
  Playwright et accessibilité, antivirus clamd réel (`pnpm --filter backend test:clamav` possible), images (Trivy),
  oasdiff. · À reprendre si la CI revient.

- **2026-11-06** · `me.profile` liste `version_conflict` dans ses erreurs (`endpoints.yaml`, contrat) mais `ifMatch: false`
  et le corps du PATCH ne porte pas de version : l'erreur ne peut pas arriver (lot 3.1 : jamais levée). · Retirer
  `version_conflict` de `me.profile`, ou passer le PATCH en `If-Match` (au choix).

- **2026-11-06** · Lot 3.1, étape 3 — **proposition de spec (non appliquée)** : `docs/architecture/03-auth.md`
  § Mot de passe oublié, 2 dit « notification aux gestionnaires de ses associations (souscripteur) ». Depuis la décision
  « rôle le plus élevé » (decisions.md, 2026-11-06), une souscriptrice qui gère une association ou fait partie du
  personnel est traitée par la plateforme (ou le script). · Ajouter cette phrase à architecture/03 (accord requis).
  Cas limite relevé par `isolation-reviewer` : une souscriptrice seulement **invitée** comme gestionnaire voit sa demande
  envoyée à la plateforme, où pf.resets l'ignore (404 : `spaceAccess` exige une appartenance active) ; sa voie de
  récupération reste l'invitation (activation). À assumer ou à exclure de `platformHandled` (au choix).
  Fenêtre d'escalade fermée : `auth.reset` refuse (`reset_token_invalid`) un code émis par une association si la personne
  gère une association ou fait partie du personnel au moment de la réinitialisation (test dans association-resets).

- **2026-11-07** · Lot 3.2 — association **suspendue** : rien ne dit si elle disparaît de l'espace `/me` (cartes,
  paiements) ; `subscriberEnrollmentsOf` l'affiche tant que l'appartenance est active. Le cache de 30 s n'est pas
  invalidé par `association.suspended` (pas de personne dans l'événement). Relevé par `isolation-reviewer`. · À trancher.

- **2026-11-07** · Lot 3.3 (après `chore/preuve-regles`), relevé par `money-reviewer` — à décider :
  (1) la règle « un reçu, un paiement » porte sur l'**identifiant** du fichier : redéposer la même photo donne un nouveau
  fichier, accepté ; s'appuyer sur `files.sha256` (calculé par le worker) demanderait une décision et un changement de spec.
  (2) l'unicité ne repose que sur le verrou applicatif (`subscriberProofOf` FOR UPDATE) : un index unique partiel
  `payments (proof_file_id) WHERE status IN ('pending','validated')` la garantirait en base → `schema.sql` + nouvelle
  migration, sur accord seulement.

- **2026-11-11** · PR C étape 4 — association suspendue : la consigne ne parle que des déclarations. `me.sign` (signer
  le contrat) et le dépôt d'une preuve (`fl.upload`) restent possibles pendant la suspension. · Les bloquer aussi
  (`association_suspended`) ou non : à trancher.

- **2026-11-11** · Devise unique (0021, 0022) : le jour où la contrainte XOF sera levée, rétablir les tests retirés
  (projet qui hérite de la devise de son association, `create-project.use-case.ts` ; aperçu et vue d'ensemble dans la
  devise du projet). 0021 échoue sur une base qui aurait déjà une association ou un projet hors XOF : à contrôler
  avant toute base partagée (production : seeds en XOF). Relevé par money-reviewer.

## Demandes d'accord (actions sensibles)

## Tranché
- **2026-11-07** · Lot 3.2 — `me.dash` additionne les inscriptions de toutes les associations dans un seul `Money`
  (contrat `SubscriberDashboard.remainingTotal`) : une personne inscrite dans deux devises (XOF et XAF, permis par
  `associations.currency` et domain-rules) ferait échouer son tableau de bord (erreur explicite, jamais d'addition de
  devises). Relevé par `money-reviewer`. · Règle « une personne = une devise », ou totaux par devise dans le contrat (au choix).
  **Tranché le 2026-11-11** par l'utilisateur : « XOF partout » ; contraintes `associations_currency_xof` et
  `projects_currency_xof` (migration 0021), branche `chore/devise-unique`.

- **2026-11-07** · Lot 3.4 (`me.history`) — **paiements d'un projet quitté** : l'historique reprend les inscriptions de
  me.dash/me.payment (non retirées, appartenance souscripteur active), donc les paiements d'une inscription retirée ou
  d'une association quittée n'y figurent plus, alors que l'écran promet de « retrouver n'importe quel paiement ».
  Choix pris : cohérence avec me.payment (404 sur ces paiements, lot 3.3). Source : `get-subscriber-history.use-case.ts`,
  test d'isolation `me-history.test.ts` (inscription retirée). · Confirmer, ou décider de garder les paiements
  des inscriptions retirées (me.payment devrait alors suivre).
  → **Tranché le 2026-11-10** par l'utilisateur (« que recommande tu ? fais le ») : paiements gardés en lecture seule,
    marqués `enrollmentWithdrawn`, me.payment aussi (PR #58).
- **2026-11-07** · Lot 3.4 — **série filtrée par période** : `cumulative` repart de 0 au début de la période, `target`
  reste l'engagement total (contrat « versé cumulé par mois », fiche « courbe cumulative avec objectif » : non tranché).
  Sans effet aujourd'hui : la page calcule son graphique depuis la liste. · Choisir : cumul depuis le début (versé avant
  la période compris) ou depuis la période (actuel).
  → **Recommandation appliquée le 2026-11-10, sans réponse de l'utilisateur** : cumul depuis le début (versé avant la
    période compris), mois et versé de la période seuls (`subscriberHistoryFigures` avec `from`). À confirmer.
- **2026-11-07** · accord de l'utilisateur (« ok pour les trois »), branche `chore/preuve-regles` : (a) preuve déjà citée
  par un paiement `pending`/`validated` de la personne dans l'association → 409 `proof_already_used`, réutilisable après
  `rejected`/`canceled` (même `Idempotency-Key` exclue : rejouée) ; (b) preuve en analyse → 409 `file_scan_pending` ;
  (c) `events.yaml` : consommateur « files : rattachement de la preuve » de `payment.declared`. Specs modifiées :
  `errors.yaml`, `endpoints.yaml` (me.declare), `events.yaml`, plus `architecture/04-flows.md` §4.4 et le tableau du lot 3.3.
- **2026-11-05** · accord de l'utilisateur (« d'accord, fais 1, 2 et 3 »), branche `chore/perf-ui-decision21` :
  (1) `test/perf` hors de `pnpm verify` (`backend` `test` = `vitest run`), lancé par `pnpm test:perf` (racine) quand on
  touche en.bulk, rapports ou tableau de bord — `enrollment-bulk-200` (17–21 s pour 10 s sur ce serveur partagé) n'y
  bloque plus ; (2) `ui-deviations.md` : ligne `mg-dashboard` (lot 2.6, chiffres au jour réel, ceux de la maquette au
  2026-09-25) et ligne `mg-projets`/`mg-projet-overview` mise à jour (chiffres réels depuis #32) ; (3) décision 21
  `adopté`.
- **2026-11-05** · `pr.list`/`pr.get`/`pr.overview` à zéro — accord de l'utilisateur (« oui, fais la PR chore pour
  pr.list et pr.overview ») : branche `chore/projets-indicateurs`, chiffres par `ProjectFigures` (reporting).

- **2026-11-03** · revue humaine du lot 2.4 (transaction de validation) → validée par l'utilisateur ; `docs/progress.md` mis à jour.
  Règle durable ajoutée dans `CLAUDE.md` (« Méthode de travail ») : la revue humaine est acquise quand l'utilisateur approuve
  ou fusionne la PR qui porte le code.

- **2026-11-03** · `git push` des branches `lot/*` et `chore/*` + PR vers `backend` → autorisé durablement (règle ajoutée
  dans « Mode autonome » de `CLAUDE.md`). Fusion d'une PR, `--force`, push vers `main`/`backend` : toujours sur demande.
  Appliqué aussitôt à `chore/notes-claude` et `chore/nuxt-4.6.4`.

- **2026-11-02** · accès Docker → `dev` ajouté au groupe `docker` (`getent group docker`). En attendant une nouvelle session,
  passer par `sg docker -c "<commande>"`. `pnpm verify` sur `chore/nuxt-4.6.4` : tout vert sauf `enrollment-create`,
  tombé au démarrage (`Lock is not acquired/owned by you`, verrou du reaper testcontainers) ; relancé seul : 41/41.
- **2026-11-02** · ADR 0016 → feu vert pour nuxt 4.6.4 : fait sur `chore/nuxt-4.6.4`. Aucune GHSA retirable ; chemin
  `nitropack > @vercel/nft > glob` ajouté à l'ADR ; prochain réexamen au plus tard le 2026-12-07.
- **2026-11-02** · décision 11 (`due` affiché « À venir ») → adoptée, `docs/decisions.md` mis à jour.
- **2026-11-02** · CI de la PR #25 (lot 2.4) → verte : `gh pr view 25` montre 6 vérifications sur 6 en `SUCCESS`
  (dont « Vérifications (pnpm verify) et build »), sur le commit `4c2a163`, fusionnée le 2026-11-02.
- **2026-11-02** · `/fin-lot 2.4` → oui, fait (`docs/progress.md`).
- **2026-11-02** · mise à jour de « Où en est-on » de `CLAUDE.md` → oui, faite.
- **2026-11-02** · plan d'un `/lot` sans validation → oui (`CLAUDE.md`, `.claude/commands/lot.md`).
- **2026-11-02** · installation des dépendances → oui, faite (pnpm via corepack, `pnpm install`).
- **2026-11-02** · retard de `main` sur `backend` → normal, `backend` n'est fusionnée dans `main` que sur demande.
- **2026-11-03** · lot 2.5 — un `git stash` du lot (conflit résolu sur `identity.public.ts`) reste dans `git stash list` :
  sa suppression (`git stash drop`) attend ton accord.
- **2026-11-03** · lot 2.5 — limites à confirmer : un gestionnaire de plusieurs associations ne voit que la cloche de la
  première (comme `GET /me`, en attendant le choix d'association) ; les notifications d'une association suspendue restent
  visibles ; aucune notification dans les seeds de démonstration (pages de notifications vides en local sans activité réelle).
- **2026-11-04** · stash du lot 2.5 → suppression accordée. Vérifié : 12 fichiers sur 18 identiques à HEAD, les 6 autres
  sont une version antérieure remplacée. Supprimé par l'utilisateur le 2026-11-04 (SHA `60b07e8`, restaurable par
  `git stash store` tant qu'il n'est pas élagué).
- **2026-11-04** · CI de la PR #28 sur `15672fb` (commit docs seul) → délai de 30 s dépassé dans `coherence.mjs` sur
  `/plateforme/associations/<id>` (networkidle) ; `38b88a5` était vert. Job relancé (run 41726714892).
- **2026-11-04** · limites du lot 2.5 → accord sur les recommandations, à faire après la fusion de la #28 sur
  `chore/notifications-suivi` : (a) multi-associations renvoyé à la décision 26 (lot 4.5), mention à ajouter dans
  `docs/decisions.md` ; (b) pas de rappel J-3 pour une association suspendue ; (c) comptes désactivés exclus des
  destinataires ; (d) rattrapage des rappels J-3 manqués dans la journée (dedupe_key existante).
- **2026-11-04** · lot 2.6, étape 4 (performance) — décision prise (« Alléger le code ») : 1,9 s → ≈ 1,1 s hors cache, < 300 ms en cache ; **écart restant** sur le calcul complet, à reprendre si besoin (agrégation en base / vues matérialisées). Constat initial :
  jeu de charge 2 000 souscripteurs × 25 échéances = 50 000 échéances, ≈ 27 000 paiements validés
  (`backend/test/perf/reporting-50k.test.ts`, non commité). Mesuré sur ce serveur : `rp.report` ≈ 1,9 s, `as.dashboard`
  sans cache ≈ 1,9 s ; avec cache < 300 ms. Objectif (architecture/09) : 95 % des lectures < 300 ms.
  Cause mesurée : PostgreSQL exécute en ≈ 95 ms (index utilisés, aucun index manquant) ; le temps est dans Node —
  rapatrier les 50 000 lignes complètes ≈ 810 ms, calcul des situations ≈ 320 ms, chiffres ≈ 490 ms.
  Pistes : alléger en code (colonnes utiles seulement, calculs) sans changer la spec, ou vues matérialisées
  (architecture/09 « rapports lourds », changement de schema.sql → accord requis).

- **2026-11-06** · Lot 3.1, étape 2 — **sécurité** : `PATCH /me/profile` laisse tout compte connecté poser un email
  libre (non vérifié, aucun fournisseur) ; or `onboarding/application/provision-association.ts` (lot 1.3) rattache une
  nouvelle association au compte **actif** qui porte l'email du responsable, sans code (`handoff: null`). Un souscripteur
  qui connaît l'email d'un demandeur peut s'en emparer et devenir owner à l'approbation. Relevé par `isolation-reviewer`,
  vérifié dans le code. · Décision demandée à l'utilisateur (email non modifiable en libre-service en V1, ou rattachement
  automatique supprimé, ou email « vérifié » au schéma).
  → **Tranché le 2026-11-06** par l'utilisateur : email figé en V1 (non modifiable en libre-service, 422
  `not_editable`) ; profils en lecture seule ; ligne ajoutée à `docs/specs/ui-deviations.md`. Voir decisions.md.

- **2026-11-07** · Lot 3.2, démonstration sur la pile Docker — **date du jour du front figée** : `frontend/app/utils/date-reference.ts`
  (`maintenant()` = 2026-09-25, « au branchement de l'API NestJS, remplacer par `new Date()` ») alors que le back calcule
  au jour réel. Constaté sur `/accueil` le 2026-11-07 : prochaine échéance du 5 novembre affichée « dans 41 jours », et
  « Septembre 2026 · ce mois-ci » dans l'échéancier de `/projets/{id}` (chiffres du back justes, libellés relatifs faux).
  Hors périmètre du lot (touche aussi gestionnaire et plateforme, et les captures de référence dépendent de cette date).
  · À décider : quand passer `maintenant()` à l'heure réelle (ou à une date servie par le back) sans casser captures et mocks.
- **2026-11-07** · Lot 3.2 — base de dev de la pile Docker semée avant le lot : Moussa y reste inscrit **actif** à Voyage
  solidaire (525 000 F restants au lieu de 395 000 F) ; `seed-dev` ne modifie pas l'existant. Les chiffres de référence sont
  prouvés par `backend/test/integration/me-dashboard.test.ts` sur une base neuve. · Réinitialiser la base de dev
  (suppression de données) seulement sur accord.
- **2026-11-07** · Lot 3.4, étape 2 — preuve d'un paiement **côté gestionnaire** : `fl.get` n'est basculé que pour les
  espaces plateforme et souscripteur ; la file de validation et le détail (`lg.pay.get`, réel) affichent encore une preuve
  fichier sans contenu (`[URL]`). Le back l'autorise déjà (test `files.test.ts`, « preuve rattachée à A »). · À faire dans
  un lot gestionnaire ou une `chore/` : brancher `useLectureFichier` dans VisionneusePreuve côté `/asso/paiements`.
- **2026-11-07** · Lot 3.4, démonstration — un paiement de 25 000 F (Centre communautaire, preuve `recu.png`) a été déclaré
  en attente pour Moussa dans la base de dev Docker afin de montrer la preuve. · Le laisser (données de dev) ou le rejeter
  depuis `/asso/paiements` ; aucune suppression faite.
- **2026-11-08** · Lot 3.5, étape 3 — **grille et déclarations proches des seuils** sur la pile locale : `lg.grid` charge et
  calcule toutes les inscriptions du projet à chaque page (`MemberDirectory.entries` puis `pageOf` en mémoire) ≈ 200 ms pour
  200 × 24 ; déclarations p95 ≈ 700 ms à 5 en parallèle (seuil 800). Pas d'optimisation au lot 3.5 (touche le calcul des
  états, lot 2.4). · À reprendre si un projet dépasse quelques centaines d'inscriptions, ou au réglage du pool (10 connexions).
- **2026-11-08** · Lot 3.5 — données de recette dans la base de dev Docker : associations « Coopérative Essai … » (parcours
  `jalon`) et « Charge … » (k6, 200 inscrits, 200 déclarations) avec leurs comptes. · Les laisser ou réinitialiser la base
  de dev, seulement sur accord. PR #43 (chore/fin-lot-3.4) encore ouverte.
- **2026-11-08** · Lot 3.5, étape 4 — build sans mocks : les écrans V2 (lots 4.x et suivants : `/associations`
  souscripteur via `me.assos`, contrats, équipe…) appellent encore des endpoints absents (404 de NestJS) ; seuls les
  parcours V1 sont filtrés. Sans conséquence avant le lot 7.1 (tout le V2 est livré avant), sinon masquer ces entrées de
  menu par `endpointDisponible`. · Pile `cotiz-prod` (conteneurs et volumes de la répétition) laissée en place :
  `tools/repetition-production.sh --arreter` l'arrête ; supprimer ses volumes seulement sur accord.


- **2026-11-08** · Lot 4.1 (revue `money-reviewer`, étape 2) — **à trancher par l'utilisateur (spec)** :
  `domain-rules.md` § 9 ne fige les conditions financières qu'au premier paiement validé ; sur un projet sous contrat, un
  gestionnaire peut donc changer montant, fonds d'entrée ou fréquence après le verrouillage du contrat ou des signatures,
  alors que `{montant}`… sont calculés depuis le projet courant (le souscripteur aurait signé d'autres montants).
  Proposition : poser `financial_terms_locked_at` au verrouillage du contrat (ou refuser `financial_terms_locked` dès
  qu'un contrat est verrouillé). → **Tranché** (2026-11-08, accord de l'utilisateur) : figées au verrouillage, commit
  a3b806b. Autres points de spec signalés : retrait d'une inscription jamais signée
  (`pending_signature → withdrawn` absent de domain-rules), décision 20 encore `proposé`, architecture/04 l. 22
  (« échéances générées à l'inscription »).

- **2026-11-08** · Lot 4.1, étape 3 (revue `isolation-reviewer`) — corrigés : mise à jour de l'inscription vérifiée à
  la signature, tests « autre personne de la même association, RLS élargies » et « événement d'une autre association »
  (consommateurs). **À proposer, sur accord (RLS ou spec)** :
  - consommateur `contract-schedule` : ne relit pas `contract_signatures` (aucune politique `system_*` en 0015) ;
  - `contracts.subscriber_enrolled_read` (0015) ignore le statut de l'inscription (retirée comprise) et l'appartenance
    active ; le code compense (`subscriberEnrollmentsOf`) — à resserrer par une nouvelle migration ;
  - me.contract montre un contrat pas encore verrouillé (texte encore modifiable) : à confirmer côté produit ;
  - `events.yaml` annonce le consommateur de `contract.signed` dans `ledger`, il est dans `members` ;
  - production : `TRUST_PROXY_HOPS` derrière Traefik, sinon l'IP enregistrée comme preuve de signature est celle du
    proxy (`src/app.ts`).
- **2026-11-08** · Lot 4.1, étape 3 (revue `money-reviewer`) — corrigés : consommateur `contract-schedule` en erreur
  (réessai de l'outbox) au lieu d'abandonner en silence ; horizon roulant rétabli au jour de la signature ; tests
  « même échéancier qu'en.create » (dont `late_since`) et « cycle roulant signé tard ». **À trancher par l'utilisateur** :
  - rattrapage : les échéances passées entre l'inscription et la signature naissent `late` (comme en.create, Q3), alors
    que me.declare refusait tout paiement avant la signature (`signature_required`) — garder, ou dater le retard de la
    signature ?
  - signature sur un projet clos (`completed`, `archived`) → **tranché** (utilisateur, 2026-11-08 : « on ne peut pas
    signer un projet clos ») : refusée en 404 (rien à signer, sans changer `endpoints.yaml`), statut relu après le verrou.
  - à noter : pas d'audit de la génération par le consommateur (journal seulement), fonds d'entrée à la signature non
    testé (aucun projet de test avec fonds d'entrée).
- **2026-11-08** · Lot 4.1, étape 4 — **à trancher par l'utilisateur** :
  - `GET /me` en espace association lit `features` sans le plan (`planFeatures: null`, contexte sans association :
    RLS de `subscriptions`) → `contracts` (planGated) jamais annoncé, onglet contrat « Bientôt disponible » après
    bascule. Options : (1, recommandée) contexte de l'association courante posé par MembershipGuard pour `me` seulement ;
    (2) fonction SQL SECURITY DEFINER (migration) ; (3) front déduit du plan (bl.sub).
  - PDF : texte rendu à nouveau depuis le profil et le nom de l'association **courants** ; un changement de nom
    (me.profile, as.update) entre la signature et la génération casse l'égalité d'empreinte → PDF jamais produit (8
    tentatives, puis GlitchTip). Figer le texte rendu (ou ses valeurs) à la signature demande une colonne
    (`contract_signatures`, schema.sql) — changement de spec.
  - Accès au PDF après la fin de l'adhésion : fl.get le sert toujours au souscripteur (son contrat) ; me.contracts ne
    le liste plus. À confirmer.

## 2026-11-08 · Test instable `auth-password.test.ts` « demandes simultanées : jamais plus de 3 » (hors lot 4.1)
- Échec une fois sur `pnpm verify` complet (4 demandes au lieu de 3), 3/3 vert isolé ; code non touché par le lot 4.1.
- Hypothèse non vérifiée : `request-password-reset.use-case.ts` compte les demandes par `countDistinct(created_at)`
  (heure de début de transaction) ; deux transactions commencées à la même microseconde comptent pour une, d'où une
  4e demande sous forte charge. Piste : compter un identifiant de demande (colonne ou regroupement) plutôt que l'heure.
  À trancher par l'utilisateur (correctif dans un lot ou une PR `chore/`).

## 2026-11-10 · PR C étape 1 (late_from) — **à trancher par l'utilisateur**
- Reprise des données existantes : la migration 0020 pose `late_from = NULL` partout. Les inscriptions signées **avant**
  la migration avec des échéances déjà passées gardent un retard compté depuis l'échéance (`status = 'late'`,
  `late_since` ancien). Options : (1, recommandée) migration de reprise (prochain numéro, 0021 et 0022 étant pris par la devise) : `late_from` = jour local de
  `contract_signatures.signed_at` quand `due_date` < ce jour, puis recalcul par `installments.refresh-statuses`
  (statut et `late_since`) ; (2) règle « signatures futures seulement », consignée. Touche des données d'argent :
  non faite sans accord. *Relecture money-reviewer du 2026-11-10.*
- Lot 4.3 (relances `after_due`, `offsetDays`) : compter les jours de retard depuis `lateStart`/`lateSince`, pas
  `due_date` (le mock `frontend/app/composables/api/relances.ts` part de `dueDate`).
- Défense en profondeur (relecture isolation, 2026-11-10), changement de spec à proposer : figer `installments.late_from`
  en espace association (déclencheur, nouvelle migration) ; n'autoriser `enrollments.activated_at` en espace
  souscripteur que pendant `pending_signature → active` (`guard_enrollment_update`, 0012). Aucun code ne les écrit hors
  du consommateur et de `me.sign` aujourd'hui.
- Proposition de spec (relecture isolation, PR C étape 2) : `contract.locked` et `contract.signed` n'invalident pas le
  cache de me.dash (`SUBSCRIBER_DASHBOARD_EVENTS`) ; « à signer » apparaît ou disparaît avec 30 s de retard au plus.
  Ajouter `contract.signed` (nomme `userId`) demande d'ajouter le consommateur à `docs/specs/events.yaml`.

## 2026-11-10 · Branches distantes fusionnées supprimées (fait, sur demande)
- Demande : « supprime les branches distantes fusionnées », confirmée « Les 50 fusionnées ». Les 50 branches de
  `git branch -r --merged origin/backend` ont été supprimées (lot/0.1 à lot/4.1, lot-01 à lot-09, chore/*, docs/*).
  Restent : `main`, `backend`, `chore/projets-indicateurs` (non fusionnée). Commits accessibles par les fusions.

## 2026-11-11 · Lot 4.2, étape 1 (relecture isolation, remarques reportées)
- Étape 3 : `push_subscriptions.endpoint` est unique pour toute la base. Un appareil déjà abonné par une autre personne
  (téléphone partagé) → 23505 à l'INSERT, et `ON CONFLICT DO UPDATE` lèverait une violation RLS. À gérer sans révéler
  l'abonnement d'autrui (même réponse 201 ; reprise de la ligne en espace system).
- `message_templates` : DELETE permis à cotiz_app (pas une donnée financière). `reminder_rules.template_id`
  (lot 4.3) les référencera : préférer une nouvelle version à une suppression. Écriture des modèles de la plateforme :
  cotiz_platform (BYPASSRLS), à réserver aux cas d'usage `/platform`.

## Lot 4.2 · étape 3 — relecture d'isolation (2026-11-11), points en attente d'accord
Corrigés dans la branche : appareil d'une autre personne retiré du navigateur (garde des gabarits), 10 appareils actifs au plus, bornes des clés et de l'URL (contrat), port 443 seul, ouverture d'URL du service worker, rétention des jobs `notify-push` réduite à 24 h, tests ajoutés.
À décider (changement de `docs/specs`) :
- **Mot de passe changé ou réinitialisé → couper le push** : aujourd'hui les abonnements restent actifs (téléphone volé : la victime réinitialise, l'appareil continue de recevoir). Proposition : consommateur `notifications` de `user.password_changed` (events.yaml, consumers) qui désactive tous les abonnements de la personne.
- **Débit sur `me.push › subscribe`** (`rateLimited: true` dans endpoints.yaml) : le plafond de 10 appareils limite déjà les appels du worker.
- **Texte sur l'écran verrouillé** : une déclaration montre « Nom a déclaré 25 000 F pour Projet ». Choix produit à confirmer (texte réduit pour le push ?).
- `screens.yaml` : `uiDeviations` de mg-profil (0) et mb-profil (1) ne comptent pas la ligne ajoutée à ui-deviations.md pour le bloc appareil.
- **Session expirée sans déconnexion (relecture étape 4)** : la garde du front ne retire l'abonnement d'une autre personne qu'à l'ouverture d'une page d'espace ; d'ici là, l'appareil partagé affiche ses push (nom, montant). Options : lier l'abonnement à la famille de sessions (changement de schema.sql) ou push au texte générique (« Nouvelle notification Cotiz », détail dans la cloche). À trancher avec le point « texte sur l'écran verrouillé ».
- **Modèles d'association non appliqués** à `user.activated` (événement sans association) ni au récapitulatif des déclarations groupées : ils reçoivent les modèles de la plateforme ou le texte du code. Lecture par entrée planifiée à prévoir si des modèles d'association sont saisis (lot 4.3 ?).

### Lot 4.2 — Web Push en déploiement (2026-11-11, en attente d'accord)
- `WEB_PUSH_HOSTS` n'a plus de valeur par défaut (choix de l'utilisateur : « Liste dans la config ») ; valeurs dans `docs/runbooks/web-push.md`.
- `infra/compose/production.yml` ne transmet ni `VAPID_*` ni `WEB_PUSH_HOSTS` : renvoyé au lot 7.1, comme les autres variables optionnelles (le fichier les interdit vides, une clé VAPID vide ferait échouer le démarrage). Push désactivé en production d'ici là.

### Recette Dokploy (2026-11-11)
- ~~Après la fusion de la PR #64 : repasser la source sur `backend`~~ fait le 2026-11-11.
- Pas de redéploiement automatique (source Git publique, sans webhook) : redéployer à la main après chaque fusion. Webhook GitHub → Dokploy : étape 2 du lot 7.1.
- Mémoire du serveur : la recette s'ajoute à la pile de dev (`cotiz-*`) et à la répétition de production (`cotiz-prod-*`, lot 3.5), toujours lancées ; les arrêter si besoin (demander).

### Dev Dokploy (2026-11-12)
- ~~Après la fusion de la PR #65 : repasser la source du dev sur `backend`~~ remplacé le 2026-11-12 : le dev suit la branche `dev`.
- Projet compose du dev au nom aléatoire (`compose-index-bluetooth-application-d13iyl`, `appName` non passé à `compose.create`) : cosmétique, conteneurs à chercher sous ce nom.

## 2026-11-12 · Lot 4.4 — déclencheur du worker pour le classement et l'exécution (**tranché** : option 1, événements ajoutés à events.yaml et emits d'endpoints.yaml)
- `events.yaml` n'a que `import.created` (→ analyse) ; `im.steps` (mappage changé → reclassement) et `im.commit`
  (→ exécution dans le worker, 5 000 lignes) n'ont aucun événement. Toutes les files BullMQ sont alimentées par le
  worker (consommateurs d'outbox) ; l'API n'en alimente aucune. Règle 5 : effets de bord par l'outbox.
- Options : (1, recommandée) ajouter `import.mapped` et `import.commit_requested` à `events.yaml` ; (2) l'API ajoute
  le job directement à la file `imports` ; (3) reclassement synchrone dans l'API, exécution déclenchée autrement.

## 2026-11-12 · Lot 4.4 — relecture d'isolation, points en attente d'accord
Corrigés dans la branche :
- l'exécution recontrôle le demandeur (au départ, à chaque reprise, toutes les 25 lignes) ; s'il est retiré ou devenu lecteur, l'import échoue avec `requester_removed` (nouveau motif ajouté au contrat `ImportFailure`) ;
- chaque ligne est inscrite par son téléphone, comme en.create, jamais par le compte vu au classement ;
- un résultat de ligne déjà écrit n'est jamais remplacé ;
- `saveClassification` est filtré sur l'import ;
- `enrolledUserIdsOf` vérifie le contexte de l'association ;
- l'audit des inscriptions porte le rôle du demandeur (`association:<rôle>`).

À décider (changement de `docs/specs`) :
- **Sondage de téléphones en masse** : im.flow et im.steps (`rateLimited: false`, `audited: false`) disent, pour 5 000 numéros, s'il existe un compte (`existingUserId`) et s'il est fermé (`account_closed`). mb.lookup, lui, est limité en débit et audité. Pistes : limite de débit sur im.flow et im.steps, audit du nombre de lignes `existing` par classement, ne plus distinguer `account_closed` avant l'envoi.
- **Index `import_rows (import_job_id, row_number)`** : la lecture paginée et le classement filtrent sur `import_job_id` sans index (le test de conformité compare strictement à schema.sql). Proposition : l'ajouter à schema.sql et dans une migration.
- **Association suspendue pendant une exécution** : l'exécution continue (seul le droit du demandeur est recontrôlé). À aligner sur la règle des écritures d'une association suspendue.
- Limite connue : corriger une ligne ne reclasse pas les doublons des lignes suivantes (seul un nouveau mappage reclasse tout).

- **2026-11-12 · lot 4.3 · relance de signature** — `docs/ui/manager.md` (`mg-projet-contrat` l. 368, page Contrats
  l. 725) : « Relancer » les non-signataires passe par `rm.send`. Le contrat de `rm.send` (rappel + entrée « À relancer »,
  `ReminderQueueEntry.installmentId` obligatoire) ne vise que des échéances : une inscription `pending_signature` n'en
  reçoit aucune (`queued: []`), et l'écran affiche quand même « rappel envoyé ». À trancher : rappel de signature dans
  `rm.send` (spec à compléter : message, statut, file), endpoint dédié, ou bouton masqué jusqu'à un lot ultérieur.
  *`send-reminders.use-case.ts`, `remindable-installments.ts` (`enrollments.status = 'active'`), `asso/contrats.vue:68`.*
- **2026-11-12 · lot 4.3 · retard partiellement déclaré** — `domain-rules.md` : `declared` l'emporte sur `late`. Une
  échéance en retard avec une déclaration partielle en attente (reste dû > 0) sort donc de la file « À relancer », et une
  règle `after_due` la classe `auto_sent` au lieu de `to_handle`. Conforme à la spec ; à confirmer que c'est voulu
  (sinon : retard calculé par `lateSince` et reste dû). *Relecture money-reviewer, `remindable-installments.ts`.*
- **2026-11-12 · lot 4.5 · association courante d'un gestionnaire** — décision 26 : un gestionnaire de plusieurs
  associations (possible dès `tm.team`) garde la première association gérée dans `/me`, l'en-tête et la cloche.
  Sélecteur côté gestionnaire reporté (choix de l'utilisateur, 2026-11-12) ; à planifier.

- 2026-11-12 · « Enregistrer le brouillon » (création de projet) échoue par moments sans requête `pr.create`
  (toast « Vérifiez votre connexion ») : corps refusé côté client (parse Zod du contrat dans `@cotiz/api-client`) ;
  un brouillon « nom seul » est aussi refusé (startDate vide). À examiner : le contrat exige un projet complet.
