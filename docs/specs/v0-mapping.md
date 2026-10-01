# Correspondance V0 → contrat (lot 0.3)

Normatif pour le lot 0.3. Pour chaque route de la V0 (`docs/api-v0.md`, chemins français), l'id d'endpoint de
`endpoints.yaml` et l'opération du registre `@cotiz/contracts` qui la remplacent, les champs renommés et les écarts.
Chaque écart porte sa **décision** : *contrat* (ajout dans `packages/contracts` et, si besoin, `endpoints.yaml` /
`schema.sql`), *front* (le front s'adapte, rien n'est ajouté au contrat) ou *rendu* (écart visible accepté, à revoir
dans le lot de l'écran). Les handlers simulés de l'étape 3 et les composables de l'étape 5 suivent ce document.

## 1. Règles générales

| Sujet | V0 | Contrat | Décision |
|---|---|---|---|
| Base | `/api/...` (français) | `/api/v1/...` (anglais) | Handlers simulés sous `frontend/server/api/v1/**` ; anciens handlers supprimés à l'étape 5, quand plus aucun composable ne les appelle. |
| Identifiants | slugs (`centre-communautaire`, `moussa-diarra`) | UUID | *front* : identifiants UUID déterministes dans les mocks (`frontend/server/mocks/ids.ts`, dérivés du slug). Les routes du front portent l'UUID (`/asso/projets/<uuid>`) ; scripts de capture et parcours e2e lisent les UUID dans `ids.ts`. Les associations gardent leur `slug` (champ du contrat). |
| Montants | entier `MontantFCFA` | `Money` `{ amount, currency }` | Affichage par `formatFCFA(money)` qui délègue à `formatMoney` de `@cotiz/domain`. |
| Dates | `AAAA-MM-JJ` partout | `IsoDate` (jour) / `Instant` (`…Z`) | Horodatages V0 convertis en instants UTC (Abidjan = UTC). |
| Erreurs | `{ statusCode, statusMessage, data.code }` | `Problem` (`application/problem+json`, `code` du catalogue) | Table § 3. Le front lit `ApiError.problem.code`. |
| Session | cookie `cotiz_role` | jeton d'accès + `GET /me` | Conservé jusqu'au lot 1.1 : `auth.login` simulé pose `cotiz_role` (espace → rôle) et renvoie un `AccessToken` factice ; `me` résout l'utilisateur du cookie. |
| Scénarios | `?scenario=` | — (dev seulement) | Conservés à l'identique sur les handlers `v1`, plus les erreurs déclenchables de l'étape 3 (§ 4). |
| Placeholders dans un champ typé (`[N]`, `[MONTANT]`, `[DATE]`, `[PRIX]`, `[email]`, `+225 [XX…]`) | chaîne à la place du nombre, de la date… | type strict | Champ *nullable* : `null` dans le mock, le composant affiche le placeholder comme valeur de repli (règle de `docs/placeholders-v0.md`). Champ non nullable : valeur de `seed-reference.yaml` si elle existe, sinon **calculée** à partir du jeu (comptes, sommes). Les chaînes libres (références, textes, noms) gardent leur placeholder. Écarts de rendu qui en résultent : § 5. |
| Tableaux de bord | valeurs saisies | `expected` de `seed-reference.yaml` | Chiffres calculés à partir des inscriptions nommées (échéances par `generateSchedule()`, répartition par `proposeAllocation()`) **plus** un complément agrégé déclaré dans le jeu (`unlisted` : souscripteurs présents dans les compteurs mais jamais nommés dans les maquettes). Voir étape 2. |
| Calculs | `app/utils/allocate|echeancier|echeances|statuts.ts` | `@cotiz/domain` | Les utilitaires du front délèguent au domaine (règle n° 2) ; leurs tests front sont remplacés par ceux du domaine. |

### Renommages courants

`nom`→`name` (projet, association, plan) · `prenom`/`nom`→`firstName`/`lastName` · `telephone`→`phone` (E.164 `+2250544218790`, affiché groupé) ·
`email` · `ville`→`city` · `pays`→`country` · `statut`→`status` · `montant`→`amount`/`amountDue`/`amountDeclared` ·
`montantPaye`→`amountPaid` · `rang`→`sequence` (0 = fonds d'entrée) · `estFondsEntree`→`kind = entry_fee` · `date` (échéance)→`dueDate` ·
`declareLe`→`declaredAt` · `dateVirement`→`paidOn` · `traiteLe`/`traitePar`→`reviewedAt`/`reviewedBy` · `repartition`→`covered` (lecture) / `allocations` (écriture) ·
`fondsEntree`→`entryFee` · `montantEcheance`→`installmentAmount` · `frequence`→`frequency` · `jourEcheance`→`dueDay` · `typeCalendrier`→`scheduleType` ·
`dateDebut`/`dateFin`→`startDate`/`endDate` · `delaiGraceJours`→`graceDays` · `souscripteursRequis`→`requiredSubscribers` ·
`verse`/`reste`/`engagement`/`montantEnRetard`→`paid`/`remaining`/`commitment`/`lateAmount` · `inscritLe`→`joinedAt` · `contratSigneLe`→`contractSignedAt` · `retireLe`→`withdrawnAt` ·
`creeLe`/`creeeLe`→`createdAt` · `lue`→`readAt ≠ null` · `lien`→`actionUrl` · `message` (notification)→`body`.

### Énumérations

| V0 | Contrat |
|---|---|
| Projet : `brouillon` · `inscriptions_ouvertes` · `en_cours` · `termine` | `draft` · `enrolling` · `active` · `completed` |
| Échéance : `a_venir` · `declaree` · `payee` · `partielle` · `en_retard` | `upcoming` (et `due`, affiché « À venir », décision 11) · `declared` · `paid` · `partial` · `late` |
| Paiement : `en_attente` · `valide` · `rejete` | `pending` · `validated` · `rejected` |
| Situation : `signature_attendue` · `a_jour` · `en_retard` | `signature_required` · `up_to_date` · `late` (+ `withdrawn`, `activation_pending`) |
| Association : `active` · `impayee` · `suspendue` · `onboarding` | `active` · `past_due` · `suspended` · `onboarding` |
| Demande : `a_traiter` · `approuvee` · `refusee` | `pending` · `approved` · `rejected` |
| Moyen : `virement` · `mobile_money` · `especes` | `bank_transfer` · `mobile_money` · `cash` |
| Fréquence : `hebdomadaire` · `mensuelle` · `trimestrielle` · `semestrielle` · `annuelle` | `weekly` · `monthly` · `quarterly` · `semiannual` · `annual` |
| Calendrier : `dates_fixes` · `cycle_roulant` | `fixed` · `rolling` |
| Motif de rejet : `preuve_illisible` · `montant_non_recu` · `montant_different` · `autre` | `unreadable_proof` · `not_received` · `amount_mismatch` · `other` |
| Rôle gestionnaire : `principal` · `secondaire` | `owner` · `manager` |
| Rôle plateforme : `proprietaire` · `administrateur` · `support` | `owner` · `admin` · `support` |
| Plan : `actif` · `archive` | `isActive` (+ `archivedAt`) |
| Facture plateforme : `a_venir` · `en_attente` · `payee` · `impayee` | `draft` · `open` · `paid` · `overdue` |
| Facture d'abonnement : `payee` · `a_payer` · `impayee` | `paid` · `open` · `overdue` |
| Abonnement : `actif` · `echeance_proche` · `suspendu` | `status` `active` (+ facture `open` proche de `dueAt`) · `suspended` |
| Souscripteurs estimés : `Moins de 50` · `50 à 100` · `100 à 250` · `Plus de 250` | `1_20` · `21_50` · `51_200` · `201_500` · `500_plus` : le sélecteur de `/demande` reprend les tranches du contrat (**R8**) |
| Projets envisagés : `1` · `2 à 3` · `3 à 5` · `Plus de 5` | `plannedProjects` entier : 1 · 2 · 4 · 6 (table de libellés côté front) |

## 2. Table des routes

Légende des écarts : **C** = ajout au contrat, **F** = adaptation du front, **R** = écart de rendu (§ 5).

### Session et authentification

| V0 | Contrat | Champs | Écarts → décision |
|---|---|---|---|
| POST `/api/session/connexion` | `auth.login` › `login` | `{ espace, identifiant, motDePasse }` → `{ space, identifier, password }` ; `ResultatConnexion` → `LoginResponse` | `etape: 'connecte'` → `status: authenticated` ; `code-requis` → `mfa_required` ; `premiere-connexion` → erreur `account_not_activated` (**F** : le front affiche l'étape « première connexion » existante). |
| POST `/api/session/code` | `auth.mfa` › `verify` | `{ code }` → `{ mfaToken, code }` | — |
| POST `/api/session/mot-de-passe` | `auth.activate` › `activate` | `{ motDePasse }` → `{ space, identifier, code, newPassword }` | **F** : le mot de passe provisoire saisi à la connexion sert de `code` (le mock accepte le code d'activation `K7M4-P9QX`, documenté dans `IDENTIFIANTS.md`). Le texte « code remis par l'association » arrive au lot 1.1 (ui-deviations). |
| GET `/api/session/moi` | `me` › `get` | `UtilisateurSession` → `Me` | `role` ← `space` ; `association` ← `memberships[]` + `currentAssociationId` ; `fonction` ← `memberships[].title` (**C1**) ; `sigle` → initiales calculées (**F**) ; `plan` de la carte de la barre latérale ← `bl.sub` (**F**). `features` et `permissions` ajoutés. |
| POST `/api/mot-de-passe/code` | `auth.forgot` › `forgot` | `{ profil, identifiant }` → `{ space, identifier }` ; réponse 202 sans corps | `EnvoiCode.destination` = identifiant saisi, `delaiRenvoi` = constante d'interface (**F**). |
| POST `/api/mot-de-passe/verification` | `auth.verify` › `verify` | `{ code }` → `{ space, identifier, code }` → `ResetToken` | — |
| POST `/api/mot-de-passe/nouveau` | `auth.reset` › `reset` | `{ motDePasse }` → `{ resetToken, newPassword }` | — |

### Public

| V0 | Contrat | Champs | Écarts → décision |
|---|---|---|---|
| GET `/api/plans?statut=actif` | `pub.plans` › `list` | `Plan` → `PublicPlan` ; `prixMensuel`/`prixAnnuel` → `priceMonthly`/`priceYearly` ; `quotas` → `limits` ; `misEnAvant` → `isFeatured` | `fonctionnalites` (libellés) → `features` (clés) : libellés des cartes tarifaires dans une table d'interface (**F**). Prix et limites de `seed-reference.yaml` au lieu de `[PRIX]` / `[N]` (**R1**). |
| POST `/api/demandes` | `pub.request` › `create` | `NouvelleDemande` → `AssociationRequestInput` (`association.description` → `activityDescription`, `responsable` → `contact` + `title`, `besoins` → `needs`, `cguAcceptees` → `termsAccepted`) ; `DemandeCreee.email` → `contactEmail` | `altcha` obligatoire : le mock accepte toute valeur non vide, le front envoie un jeton factice tant que le widget n'existe pas (lot 1.3) (**F**). |

### Plateforme (super-admin)

| V0 | Contrat | Champs | Écarts → décision |
|---|---|---|---|
| GET `/api/demandes` | `pf.req.list` › `list` | `Demande[]` → `listOf(AssociationRequestSummary)` | — |
| GET `/api/demandes/:id` | `pf.req.get` › `get` | `DemandeDetaillee` → `AssociationRequestDetail` ; frise `historique` → `history` | Événement « consultée par Richy » : **C2** (`viewedAt`, `viewedBy`) ; la frise insère « Consultée » entre « Reçue » et la décision (**F**). |
| POST `/api/demandes/:id/approbation` | `pf.req.approve` › `approve` | `{ planId, comptesGestionnaires, debutAbonnement, noteInterne, messagePersonnalise }` → `{ planId, managerSeats, subscriptionStartsOn, internalNote, personalMessage }` | Réponse `RequestApproved` (avec `handoff`) : la carte « Accès du gestionnaire » arrive au lot 1.3 ; en 0.3 le front garde l'écran V0 (**F**). |
| POST `/api/demandes/:id/refus` | `pf.req.reject` › `reject` | `{ motif, precisions }` → `{ reasonCode, message }` | Motifs : codes stables côté front (table de libellés) (**F**). |
| GET `/api/plateforme/tableau-de-bord` | `pf.dashboard` › `get` | `TableauDeBordPlateforme` → `PlatformDashboard` (`demandesPrioritaires` → `oldestPendingRequests`, `evolution` → `activeAssociationsByMonth`, `repartition` → `associationsByPlan`, `aSurveiller` → `watchlist`, `activite` → `activity`) | `kpi.souscripteurs` et `revenuMensuel` (`[N]`, `[MONTANT]`) : calculés (**R2**). Titre et ton des événements d'activité dérivés de `type` (**F**). Signal `onboarding` → `inactive` (**F**). |
| GET `/api/associations` | `pf.asso.list` › `list` | `ListeAssociations` → `listOf(PlatformAssociationSummary)` ; `compteurs` → `facets.status` | `derniereActivite` → `lastActivityAt` ; `sigle` → initiales (**F**). |
| POST `/api/associations` | `pf.asso.create` › `create` | `NouvelleAssociationPlateforme` → `CreateAssociationInput` (`gestionnaire` → `owner`, `abonnement` → `subscription`, `envoyerIdentifiants` → `issueCredentialsNow`) | — |
| GET `/api/associations/:id/fiche` | `pf.asso.get` › `get` + `pf.asso.sub` › `projects`, `members` + `pf.invoices` › `list?associationId=` | `FicheAssociationPlateforme` → `PlatformAssociationDetail` ; `contact` → `owner` ; `kpi.collecteCumule` → `kpi.collectedTotal` ; `quotas[].pourcentage` calculé (**F**) | `impaye.suspensionLe` absent du contrat : affiché `[DATE]` (**R3**). |
| POST `/api/associations/:id/plan` | `pf.asso.plan` › `changePlan` + `pf.asso.patch` › `patch` (`managerSeatsOverride`) | `{ planId, comptesGestionnaires }` | Deux appels (**F**). |
| POST `/api/associations/:id/suspension` | `pf.asso.suspend` › `suspend` | `{ motif }` → `{ reason, confirmName }` | — |
| POST `/api/associations/:id/reactivation` | `pf.asso.suspend` › `reactivate` | — | — |
| GET `/api/plans` | `pf.plans` › `list` | `Plan[]` → `PlanList` (`associationsAbonnees` → `subscribersCount`, `statut` → `isActive`) | — |
| GET `/api/plans/:id` | `pf.plans` › `list` | — | Pas d'opération unitaire : le front lit la liste et filtre (**F**). |
| POST `/api/plans` | `pf.plan.write` › `create` | `ModificationPlan` → `PlanInput` (+ `code`) | `code` déduit du nom côté front (**F**). |
| PATCH `/api/plans/:id` | `pf.plan.write` › `patch` | idem, partiel ; `If-Match` | — |
| POST `/api/plans/:id/archivage` | `pf.plan.archive` › `archive` | — | — |
| POST `/api/plans/:id/desarchivage` | `pf.plan.write` › `patch` `{ isActive: true }` | — | (**F**) |
| POST `/api/plans/:id/duplication` | `pf.plan.archive` › `duplicate` | — | — |
| GET `/api/plateforme/factures` | `pf.invoices` › `list` | `FacturationPlateforme` → `PlatformInvoiceList` (`kpi` → `summary`) | Écran V2 « Bientôt disponible » (feature `invoices` absente). |
| GET `/api/plateforme/utilisateurs` | `pf.staff` › `list` | `UtilisateurPlateforme` → `StaffMember` | Écran V2 « Bientôt disponible ». |
| GET `/api/plateforme/profil` | `me.profile` › `get` + `me.prefs` › `get` | `ProfilPlateforme` → `Profile` ; `preferences` → `items[]` (`type`, `channel`, `enabled`) | Rôle ← `Me.platformRole`. Correspondance préférence ↔ type d'événement : table d'interface (**F**). |
| PATCH `/api/plateforme/profil` | `me.profile` › `patch` + `me.prefs` › `replace` | — | — |
| POST `/api/plateforme/profil/mot-de-passe` | `me.profile` › `changePassword` | `{ actuel, nouveau }` → `{ currentPassword, newPassword }` | Réponse 204 : le front recharge `me.profile` (`passwordChangedAt`) (**F**). |

### Gestionnaire — association, abonnement, équipe, profil

`{aid}` = `Me.currentAssociationId`.

| V0 | Contrat | Champs | Écarts → décision |
|---|---|---|---|
| GET `/api/gestionnaire/association`, GET `/api/associations/:id` | `as.get` › `get` + `as.pm` › `list` | `Association` → `Association` (`telephoneContact`/`emailContact` → `contactPhone`/`contactEmail`) ; `modalitesPaiement` → `PaymentMethod[]` (`moyen` → `kind`, `iban`/`numeroMobileMoney`/`operateur` → `details`) ; `instructionsPaiement` → `instructions` du moyen | `nbProjets`, `nbSouscripteurs` → `as.dashboard` ; `sigle` → initiales (**F**). |
| PATCH `/api/associations/:id` | `as.patch` › `patch` + `as.pm` › `replace` | `ModificationAssociation` → `PatchAssociationProfile` ; `logoUrl` → `logoFileId` | Logo : pas de dépôt avant le lot 0.5, `[LOGO]` conservé (**F**). |
| (onboarding, fin) | `as.onb` › `complete` | — | Appelé à la dernière étape de `/asso/bienvenue` (**F**). |
| GET `/api/gestionnaire/tableau-de-bord` | `as.dashboard` › `get` | `TableauDeBordGestionnaire` → `ManagerDashboard` (`collecteMois` → `collectedThisMonth`/`expectedThisMonth`, `paiementsAValider` → `paymentsToReview`, `enRetard` → `lateSubscribers`, `tauxRecouvrement` → `recoveryRate` (0–1), `contratsNonSignes` → `unsignedContracts`, `collecteMensuelle` → `monthlyCollection`) | Cartes projet : `projects` (`ProjectSummary`). Pile d'avatars (`apercuSouscripteurs`) ← `en.list` `limit=3` par projet (**F**). |
| GET `/api/gestionnaire/abonnement` | `bl.sub` › `get` + `bl.inv` › `list` | `AbonnementAssociation` → `AssociationSubscription` (`utilisation` → `quotas`, `prixAnnuel` → `plan.priceYearly`) ; `factures` → `AssociationInvoice[]` | `clientDepuis` ← `currentPeriodStart` de la première période : non exposé, affiché `[DATE]` (**R3**) ; `moyenPaiement`, `emailContactCotiz` : textes d'interface (**F**). Factures : écran V2 (`invoices`). |
| POST `/api/gestionnaire/abonnement/changement` | — | — | **F** : pas d'endpoint (le changement de formule est fait par la plateforme, `pf.asso.plan`). Le bouton « Demander un changement » ouvre un message prêt `mailto:` vers le contact Cotiz (sans fournisseur). |
| GET `/api/gestionnaire/equipe` | `tm.team` › `list` | `EquipeAssociation` → `{ items: TeamMember[], seats }` ; `comptesSecondaires` → `seats` | Écran V2 (`team`, lot 4.5) : mock conservé. |
| POST `/api/gestionnaire/equipe` | `tm.team` › `invite` | `InvitationGestionnaire` → `{ firstName, lastName, email, phone, role: 'manager' }` | Réponse avec `handoff` (écart ui-deviations au lot 4.5). |
| DELETE `/api/gestionnaire/equipe/:id` | `tm.team` › `remove` | — | `principal` → `last_owner`. |
| POST `/api/gestionnaire/equipe/:id/renvoi` | — | — | **F** : renvoi d'invitation = nouvelle `invite` au lot 4.5 ; en 0.3 l'action affiche le toast V0 sans appel. |
| GET `/api/gestionnaire/profil` | `me.profile` › `get` + `me.prefs` › `get` | `ProfilGestionnaire` → `Profile` ; `motDePasseModifieLe` → `passwordChangedAt` ; `preferences` → `items[]` | `role`, `associationNom` ← `Me.memberships` (**F**). |
| PATCH `/api/gestionnaire/profil` | `me.profile` › `patch` + `me.prefs` › `replace` | — | Le téléphone du gestionnaire n'est pas modifiable par `me.profile` › `patch` : champ en lecture seule (**R4**). |
| POST `/api/gestionnaire/profil/mot-de-passe` | `me.profile` › `changePassword` | — | — |
| GET `/api/gestionnaire/contrats` | `ct.list` › `list` | `SyntheseContratProjet[]` → `listOf(ContractSummary)` | Conditions (« 50 000 F à l'entrée, puis… ») ← `pr.get` (termes financiers) (**F**) ; non-signataires ← `ct.get` par projet (**F**). Écran V2 (`contracts`). |

### Gestionnaire — projets

| V0 | Contrat | Champs | Écarts → décision |
|---|---|---|---|
| GET `/api/projets` | `pr.list` › `list` | `Projet[]` → `listOf(ProjectSummary)` ; indicateurs → `stats` (`tauxRecouvrement`, `avancement` en 0–1) | `[N]`/`[MONTANT]` de Voyage solidaire calculés (**R2**). |
| POST `/api/projets` | `pr.create` › `create` (+ `pr.lifecycle` › `publish` si non brouillon) | `NouveauProjet` → `CreateProjectInput` ; `modalitesPaiement` → `paymentMethods` (ids des moyens de l'association) ; `instructionsPaiement` → `instructionsOverride` de chaque moyen retenu ; `contratModele`/`signataire`/`contratSigne` → `contract` | `brouillon: true` → pas de `publish` (**F**). |
| GET `/api/projets/:id` | `pr.get` › `get` | `Projet` → `Project` | `imageCouvertureNom` → **C3** (`coverFileName`). |
| PATCH `/api/projets/:id` | `pr.patch` › `patch` | `ModificationProjet` → `ProjectInput.partial()` ; `If-Match: version` | — |
| DELETE `/api/projets/:id` | `pr.delete` › `remove` | — | `paiements_existants` → `invalid_state`. |
| POST `/api/projets/:id/cloture` | `pr.lifecycle` › `close` | — | `deja_cloture` → `invalid_state`. |
| GET `/api/projets/:id/synthese` | `pr.overview` › `get` | `SyntheseProjet` → `ProjectOverview` (`retardataires` → `lateMembers`, `paiementsAValider` → `paymentsToReview`, `contratsNonSignes` → `unsignedContracts`, `collecte` → `collectionBySequence`) | Mois des retards ← `lateDueDates` formatées (**F**). |
| GET `/api/projets/:id/echeances` | `lg.grid` › `get` | `{ souscription, souscripteur, echeances }[]` → `Grid` (`rows[].cells[]`, `columns`) | — |
| GET `/api/projets/:id/souscripteurs` | `en.list` › `list` | `Souscription & { souscripteur }` → `Enrollment` (`member`, `standing`) | — |
| POST `/api/projets/:id/souscripteurs/recherche` | `mb.lookup` › `lookup` | `{ telephone }` → `{ phone, projectId }` ; `cas` → `result` (`nouveau` → `new`, `compte_existant` → `existing_user`, `deja_inscrit` → `already_enrolled`) | `souscripteur` complet → `person` (prénom + initiale) ; `projets` (liste des projets du compte existant) absente : non affichée (**R5**). |
| POST `/api/projets/:id/souscripteurs` | `en.create` › `create` | `NouvelleInscription` → `CreateEnrollmentInput` (`souscripteurId` → `userId`, `dateEntree` → `startsFrom`) | `canal` (SMS/email) supprimé (ui-deviations, lot 2.3) ; `rattrapage` (rangs à rattraper) : supprimé, les échéances passées depuis `startsFrom` sont générées par le domaine (**F**). `handoff` renvoyé : carte au lot 2.3. |
| DELETE `/api/projets/:id/souscripteurs/:souscripteurId` | `en.withdraw` › `withdraw` | chemin par `eid` (inscription) | — |
| GET `/api/projets/:id/contrat` | `ct.get` › `get` | `ContratProjet` → `ProjectContract` (`texte` → `bodyTemplate`, `signataire` → `signer` + `associationSignedAt`, `signes`/`total` → `signatures`, `nonSignataires` → `unsigned`) | Écran V2 (`contracts`). |
| GET `/api/projets/:id/rapport` | `rp.report` › `get` | `RapportProjet` → `ProjectReport` (`lignes` → `rows`, `tauxParEcheance` → `recoveryRateBySequence`, `statuts` → `standingCounts`) | `graphiquesDisponibles` → feature `analytics` (**F**). |
| POST `/api/projets/:id/import/analyse` | `fl.upload` › `create`/`complete` + `im.flow` › `create` + `im.read` › `get`, `rows` | `AnalyseImport` → `ImportJob` + `ImportRow[]` | Écran V2 (`imports`, lot 4.4) : statuts de ligne V0 → `category` (`prete` → `ready`, `compte_existant` → `existing`, `telephone_incomplet`/`prenom_manquant` → `error`, `doublon` → `duplicate`). |
| POST `/api/projets/:id/import` | `im.commit` › `commit` | `{ importes, invitations, canal }` → `ImportJob` | `canal` supprimé (ui-deviations). |

### Gestionnaire — souscripteurs, paiements, relances

| V0 | Contrat | Champs | Écarts → décision |
|---|---|---|---|
| GET `/api/souscripteurs` | `mb.list` › `list` | `SouscripteurAnnuaire[]` → `listOf(MemberSummary)` (`projetIds` → `projects`, `totalVerse`/`totalReste` → `totalPaid`/`totalRemaining`, `statutGlobal` → `standing`) | `[MONTANT]` d'Ibrahim Touré calculé (**R2**). |
| GET `/api/souscripteurs/:id` | `mb.get` › `get` + `mb.timeline` › `list` | `FicheSouscripteur` → `MemberDetail` (`souscriptions` → `enrollments`, `membreDepuis` → `memberSince`) ; `historique` → `TimelineEvent[]` | — |
| PATCH `/api/souscripteurs/:id` | `mb.patch` › `patch` | `{ email, adresse }` → `{ email, address }` ; `If-Match` | — |
| POST `/api/souscripteurs/:id/identifiants` | `mb.resend` › `regenerate` | réponse `Handoff` | **F** : le toast V0 est conservé jusqu'au lot 2.3 (carte « Code d'activation »). |
| GET `/api/paiements` (gestionnaire) | `lg.pay.list` › `list` | `PaiementListe[]` → `listOf(PaymentSummary)` (`souscripteur` → `member`, `traiteParNom` → `reviewedBy`, `echeancesCouvertes` → `covered`) | `moyen` → **C4** (`paymentMethodKind`). |
| GET `/api/paiements/:id` | `lg.pay.get` › `get` | `PaiementDetail` → `PaymentDetail` (`echeancier` → `schedule`, `derniersVersements` → `recentPayments`) | `preuve` → **C5** (`proof.fileName`, `proof.mimeType`) ; URL de la preuve ← `fl.get` (`/api/v1/files/{id}`) ; mock : `[URL]` conservé (**F**). |
| POST `/api/paiements/:id/validation` | `lg.pay.validate` › `validate` | `{ repartition, montantRecu }` → `{ allocations, amountReceived }` ; `If-Match`, `Idempotency-Key` | `deja_traite` → `payment_already_reviewed`. |
| POST `/api/paiements/:id/rejet` | `lg.pay.reject` › `reject` | `{ motif, message }` → `{ reasonCode, message }` | — |
| POST `/api/paiements/:id/annulation` | `lg.pay.revert` › `revert` | — | Le contrat n'annule que la **validation** ; l'annulation d'un rejet (toast « Annuler » après rejet) n'existe pas : le toast du rejet n'offre plus « Annuler » (**R6**). `rien_a_annuler` → `invalid_state`. |
| GET `/api/relances` | `rm.queue` › `list` + `rm.rules` › `list` + `rm.hist` › `list` + `as.dashboard` (KPI « 14 sur 52 ») | `Relances` → retardataires = entrées de la file groupées par souscripteur et projet ; `regles` → `ReminderRule[]` (titre et ton dérivés de `trigger` + `offsetDays`) ; `historique` → envois groupés par (instant, règle ou auteur, projet) | Écran V2 (`auto_reminders`, lot 4.3) : mock conservé. `[N]` destinataires calculés (**R2**). |
| POST `/api/relances` | `rm.send` › `send` | `{ souscripteurIds, projetId }` → `{ userIds, projectId }` | — |
| PATCH `/api/relances/regles/:id` | `rm.rules` › `patch` | `{ active }` → `{ isActive }` | — |

### Souscripteur

| V0 | Contrat | Champs | Écarts → décision |
|---|---|---|---|
| GET `/api/moi` | `me.profile` › `get` | `Souscripteur` → `Profile` | `membreDepuis` ← `me.assos` (**F**). |
| PATCH `/api/moi` | `me.profile` › `patch` | `{ email }` | — |
| GET `/api/moi/souscriptions` (accueil) | `me.dash` › `get` | `SouscriptionMembre[]` → `SubscriberDashboard` (`remainingTotal`, `late`, `nextDue`, `projects`) | — |
| GET `/api/moi/souscriptions` (déclaration) | `me.projects` › `list` | `SouscriptionMembre[]` → `SubscriberProjectCard & { openInstallments }` | — |
| GET `/api/moi/souscriptions/:projetId` | `me.project` › `get` | `DetailSouscriptionMembre` → `SubscriberProjectDetail` (`echeances` → `installments`, `paiements` → `payments`, `contrat` → `contract`) | Moyens de paiement de l'association ← `paymentMethods`. |
| GET `/api/echeances` | `me.project` › `get` (souscripteur) / `lg.grid` (gestionnaire) | `Echeance[]` → `Installment[]` | Route générique supprimée (**F**). |
| POST `/api/declarations` | `me.alloc` › `preview` + `me.declare` › `declare` | `NouvelleDeclaration` → `DeclarePaymentInput` (`montant` → `amount`, `repartition` → `allocations`, `moyen` → `paymentMethodId`, `dateVirement` → `paidOn`, `preuve` → `proofFileId`/`transactionReference`, `commentaire` → `comment`) | Dépôt de la preuve par `fl.upload` (simulé : identifiant factice, lot 0.5) (**F**). Codes : `contrat-a-signer` → `signature_required`, `montant-trop-eleve` → `amount_exceeds_remaining`, `repartition-invalide` → `allocation_mismatch`, `preuve-manquante` → `proof_required`. |
| GET `/api/paiements` (souscripteur) | `me.history` › `list` | `PaiementListe[]` → `History` (`summary`) | — |
| (confirmation `/paiements/declarer/ok`) | `me.payment` › `get` | `Paiement` → `SubscriberPaymentDetail` | — |
| GET `/api/moi/associations` | `me.assos` › `list` | `AssociationMembre[]` → items (`association`, `memberSince`, `activeProjects`, `remaining`, `standing`) | Projets de chaque association ← `me.dash` `projects` filtrés par association (**F**). |
| GET `/api/moi/associations/:id` | `me.assos` › `get` | `AssociationMembre` → `{ association, projects, paymentMethods }` | `memberSince` ← `me.assos` › `list` (**F**). |
| GET `/api/contrats` (souscripteur) | `me.contracts` › `list` + `me.contract` › `get` | `Contrat[]` → items (`status` `to_sign`/`signed`) ; texte ← `me.contract` (`body`, `renderedSha256`) | Écran V2 (`contracts`). |
| POST `/api/contrats/:id/signature` | `me.sign` › `sign` | chemin par `pid` ; `{ renderedSha256, accepted: true }` | `deja-signe` → `already_signed`. |

### Commun

| V0 | Contrat | Champs | Écarts → décision |
|---|---|---|---|
| GET `/api/notifications` | `nt.list` › `list` | `Notification[]` → `listOf(Notification)` (`titre` → `title`, `message` → `body`, `lien` → `actionUrl`, `creeeLe` → `createdAt`, `lue` → `readAt`) | `libelleAction` → `data.actionLabel` (**F**, champ libre `data`). |
| PATCH `/api/notifications/:id` | `nt.read` › `read` | — | — |
| POST `/api/notifications/tout-lu` | `nt.read` › `readAll` | `{ ok }` → `{ updated }` | — |
| GET `/api/navigation/compteurs` | `nt.list` › `unreadCount` + `as.dashboard` (`paymentsToReview.count`, `lateSubscribers.count`) + `pf.dashboard` (`pendingRequests`) | `CompteursNavigation` | **F** : route supprimée, les compteurs sont recomposés par `useCompteursNavigation()` selon l'espace. |
| POST `/api/_dev/reinitialiser` | — | — | Outil de développement conservé hors `/api/v1` (exclu du build `NUXT_MOCKS=0`). |

## 3. Codes d'erreur V0 → catalogue

| V0 | Catalogue (`errors.yaml`) |
|---|---|
| `numero-inconnu`, `mot-de-passe-incorrect` (connexion), `identifiants-incorrects` | `invalid_credentials` (**R7** : « Ce numéro n'est rattaché à aucun compte » disparaît, le contrat ne révèle pas l'existence d'un compte) |
| `blocage` | `account_locked` |
| `compte-suspendu` | `association_suspended` |
| `code-incorrect` | `invalid_code` |
| `code-expire` | `code_expired` |
| `mot-de-passe-faible` | `weak_password` |
| `mot-de-passe-incorrect` (profil) | `invalid_credentials` |
| `deja_traitee` (demande) | `request_already_handled` |
| `quota-atteint` | `quota_exceeded` |
| `principal` | `last_owner` |
| `prenom-requis`, `nom-requis`, `email-invalide`, `email-existant`, `motif_requis`, `nom_obligatoire`, `projet_incomplet`, `contrat_non_signe`, `identite_incomplete`, `montant-invalide` | `validation_failed` (`fields.<champ>` = code de règle : `required`, `email`, `taken`…) |
| `deja_inscrit` | `already_enrolled` |
| `telephone_invalide` | `invalid_phone` |
| `deja_traite` (paiement) | `payment_already_reviewed` |
| `rien_a_annuler`, `deja_cloture`, `paiements_existants`, `rien_a_importer` | `invalid_state` |
| `contrat-a-signer` | `signature_required` |
| `montant-trop-eleve` | `amount_exceeds_remaining` |
| `repartition-invalide` | `allocation_mismatch` |
| `preuve-manquante` | `proof_required` |
| `deja-signe` | `already_signed` |
| `fichier_invalide` | `file_type_not_allowed` |
| 404 « X introuvable » | `not_found` |

## 4. Erreurs déclenchables dans les mocks (étape 3)

Scénario `?scenario=<code>` sur la page, propagé aux mutations : `allocation_mismatch` (déclaration, validation), `quota_exceeded`
(création de projet, inscription), `version_conflict` (toute écriture avec `If-Match`), `association_suspended` (toute requête de
l'espace association), `payment_already_reviewed` (validation, rejet). La règle métier réelle déclenche aussi ces erreurs quand
l'état du store l'impose (paiement déjà traité, répartition qui ne correspond pas au montant, `version` périmée).

## 5. Changements du contrat et de la spécification (décisions)

| N° | Changement | Fichiers | Justification |
|---|---|---|---|
| C1 | `memberships.title` (texte, facultatif) ; `Me.memberships[].title` | `schema.sql`, `data-model.md`, `packages/contracts` (`me.ts`) | Fonction affichée sous le nom (« Trésorière ») dans la barre latérale ; saisie à la demande (`contact.title`) et à l'invitation. |
| C2 | `association_requests.viewed_at`, `viewed_by` ; `AssociationRequestDetail.viewedAt`, `viewedBy` | `schema.sql`, `data-model.md`, `packages/contracts` (`pf.ts`) | Frise « Consultée par Richy » de SaDemande. Champs séparés plutôt qu'une valeur de plus dans `history[].type` : une valeur d'énumération ajoutée à une réponse est un changement cassant pour `oasdiff`. |
| C3 | `Project.coverFileName` (`string \| null`) | `packages/contracts` (`project.ts`) | Nom du fichier de couverture affiché dans les paramètres du projet. |
| C4 | `paymentMethodKind` (`PaymentMethodKind \| null`) sur `PaymentSummary` et `SubscriberPayment` | `packages/contracts` (`ledger.ts`, `me.ts`) | Moyen affiché dans la file de validation et l'aperçu (`payments.payment_method_id`). |
| C5 | `files.original_name` ; `StoredFile.fileName` ; `PaymentProof.fileName`, `PaymentProof.mimeType` (`string \| null`) | `schema.sql`, `data-model.md`, `packages/contracts` (`common.ts`, `ledger.ts`) | Nom et type de la preuve dans la visionneuse (image ou PDF) ; le nom est déjà transmis à `fl.upload`. |

Tous les changements sont additifs (champs nouveaux) : `oasdiff breaking` contre `backend` ne signale rien. Écarté : remplacer les tranches de `estimated_subscribers` par celles de la maquette (valeurs d'énumération retirées d'une requête = changement cassant) → R8.

## 6. Écarts de rendu acceptés

| N° | Écran | V0 | Après 0.3 |
|---|---|---|---|
| R1 | Landing, `/demande`, `/plateforme/plans`, `/asso/abonnement`, fiche association | Prix `[PRIX]`, limites `[N]` (Découverte, Essentiel), Pro `5 / 200 / 3` | Valeurs de `seed-reference.yaml` (0 F / 10 000 F / 25 000 F ; 1/20/1, 5/100/2, illimité/500/5) |
| R2 | Projets (Voyage solidaire), annuaire (Ibrahim Touré), tableau de bord plateforme, historique des relances | `[N]`, `[MONTANT]` dans des compteurs et montants | Valeurs calculées à partir du jeu |
| R3 | Fiche association plateforme (impayé), abonnement gestionnaire (« client depuis ») | dates de la maquette | `[DATE]` (donnée absente du contrat) |
| R4 | Profil gestionnaire | téléphone modifiable | téléphone en lecture seule |
| R5 | Ajout d'un souscripteur (compte existant) | liste des projets du compte | prénom et initiale seulement (protection de l'annuaire) |
| R6 | Détail d'un paiement | « Annuler » après un rejet | « Annuler » seulement après une validation |
| R7 | Connexion souscripteur | « Ce numéro n'est rattaché à aucun compte » | « Identifiant ou mot de passe incorrect » |
| R8 | `/demande`, étape 3 | Tranches « Moins de 50 · 50 à 100 · 100 à 250 · Plus de 250 » | « 1 à 20 · 21 à 50 · 51 à 200 · 201 à 500 · Plus de 500 » (`estimated_subscribers` du contrat) |
| R9 | Annuaire, cartes projet, grille, file de validation | Jean Kouassi « En retard » (août partiel) ; engagement complet (500 000 F / 170 000 F) pour une entrée en cours de projet ; Ibrahim Touré « couvre : sept. » | Calcul du domaine : l'échéance d'août de Jean, couverte par un paiement déclaré, est « Déclarée » (Jean « À jour ») ; engagement depuis la date d'entrée, sans échéance rétroactive (Fatou 350 000 F, Adjoua Yao, Ibrahim Touré et Moussa sur Voyage 130 000 F) ; Ibrahim entré en septembre, son versement entame le fonds d'entrée |
| R10 | Souscripteurs d'un projet | Fatou Traoré (signature attendue) comptée dans les 52 | 52 souscripteurs engagés + 1 signature attendue (décision 21) |
