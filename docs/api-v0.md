# Contrat d’API Cotiz — V0

> Généré par `frontend/scripts/generer-contrat-api.mjs` à partir des handlers de mocks (`frontend/server/api/`)
> et des types partagés (`frontend/types/`). **Ne pas modifier à la main** : modifier le handler ou le type, puis
> relancer `npm run contrat-api` depuis `frontend/`.

## Conventions

- **Base** : `runtimeConfig.public.apiBase` (V0 : mocks Nitro sur `/api`). Brancher NestJS = changer cette base.
- **Format** : JSON. Montants en **entiers F CFA** (pas de décimales). Dates `AAAA-MM-JJ`, horodatages ISO 8601.
- **Session** : en V0, cookie `cotiz_role` (`souscripteur` · `gestionnaire` · `superadmin`) posé par `POST /api/session/connexion`.
  Utilisateurs de la session mockée : Moussa Diarra (souscripteur), Awa Koné (gestionnaire, Entraide Yopougon), Richy (super-admin).
  Le back-end remplacera ce cookie par sa propre authentification ; les réponses restent filtrées selon l’utilisateur connecté.
- **Erreurs** : `{ statusCode, statusMessage, data?: { code } }`. Le front lit `data.code` (erreurs métier, 409/422) pour choisir le message.
  404 = ressource introuvable (le front affiche « X introuvable » + retour à la liste). 401/403 = session absente ou mauvais rôle.
- **Scénarios** (dev uniquement, à ne pas implémenter côté NestJS) : `?scenario=<état>` force un état de données.
  Communs à tous les endpoints : `erreur` (500) et `chargement` (réponse retardée de 10 s). Les scénarios propres sont listés par endpoint.
- **Latence simulée** : 200–400 ms (états de chargement).

## Sommaire

| Méthode | Route | Rôle | Description |
|---|---|---|---|
| GET | [`/api/associations/:id`](#get-apiassociationsid) | — | Détail |
| PATCH | [`/api/associations/:id`](#patch-apiassociationsid) | — | Profil et moyens de paiement de l'association (onboarding étapes 2 et 3, paramètres). |
| GET | [`/api/associations/:id/fiche`](#get-apiassociationsidfiche) | — | Détail plateforme (SaAssociation) |
| POST | [`/api/associations/:id/plan`](#post-apiassociationsidplan) | — | Change le plan de l'association, et la limite de comptes gestionnaires secondaires (« Comptes gestionnaires au |
| POST | [`/api/associations/:id/reactivation`](#post-apiassociationsidreactivation) | — | Lève la suspension (retour au statut d'avant, « active » par défaut). |
| POST | [`/api/associations/:id/suspension`](#post-apiassociationsidsuspension) | — | Suspend l'association (motif obligatoire) : plus d'accès pour ses membres. |
| GET | [`/api/associations`](#get-apiassociations) | — | Liste plateforme (SaAssociations) et compteurs des puces (illustratifs) |
| POST | [`/api/associations`](#post-apiassociations) | — | Création directe par la plateforme (SaNouvelleAssociation), sans demande préalable. |
| POST | [`/api/contrats/:id/signature`](#post-apicontratsidsignature) | souscripteur | Le souscripteur signe son contrat (signature électronique horodatée) |
| GET | [`/api/contrats`](#get-apicontrats) | — | Souscripteur : défaut = ses contrats |
| POST | [`/api/declarations`](#post-apideclarations) | souscripteur | Le souscripteur déclare un paiement (montant, échéances couvertes, preuve) |
| GET | [`/api/demandes/:id`](#get-apidemandesid) | — | Demande et frise (reçue, consultée, décision) |
| POST | [`/api/demandes/:id/approbation`](#post-apidemandesidapprobation) | — | Approuve la demande : crée l'association (onboarding) et son gestionnaire principal. |
| POST | [`/api/demandes/:id/refus`](#post-apidemandesidrefus) | — | Refuse la demande avec un motif (obligatoire) et des précisions reprises dans l'email. |
| GET | [`/api/demandes`](#get-apidemandes) | — | Demandes de création (super-admin), plus anciennes d'abord (ordre de traitement) |
| POST | [`/api/demandes`](#post-apidemandes) | — | Demande de création d'association (formulaire public /demande) |
| GET | [`/api/echeances`](#get-apiecheances) | — | Échéances (souscripteur : défaut = soi-même). |
| POST | [`/api/gestionnaire/abonnement/changement`](#post-apigestionnaireabonnementchangement) | gestionnaire | Demande de changement de formule, traitée par l'équipe Cotiz. |
| GET | [`/api/gestionnaire/abonnement`](#get-apigestionnaireabonnement) | gestionnaire | Formule, utilisation des quotas et factures de l'association |
| GET | [`/api/gestionnaire/association`](#get-apigestionnaireassociation) | — | Association du gestionnaire connecté (onboarding, création de projet). |
| GET | [`/api/gestionnaire/contrats`](#get-apigestionnairecontrats) | — | Un contrat par projet de l'association (MgContrats) : conditions, signature de l'association, contre-signature |
| DELETE | [`/api/gestionnaire/equipe/:id`](#delete-apigestionnaireequipeid) | gestionnaire | Retire l'accès d'un gestionnaire secondaire (ou annule son invitation). |
| POST | [`/api/gestionnaire/equipe/:id/renvoi`](#post-apigestionnaireequipeidrenvoi) | gestionnaire | Renvoie l'invitation (invité) ou les identifiants (actif) par email. |
| GET | [`/api/gestionnaire/equipe`](#get-apigestionnaireequipe) | gestionnaire | Gestionnaires de l'association et quota de comptes secondaires |
| POST | [`/api/gestionnaire/equipe`](#post-apigestionnaireequipe) | gestionnaire | Invite un gestionnaire secondaire (identifiants envoyés par email) |
| GET | [`/api/gestionnaire/profil`](#get-apigestionnaireprofil) | — | Informations personnelles et préférences de notification du gestionnaire connecté. |
| PATCH | [`/api/gestionnaire/profil`](#patch-apigestionnaireprofil) | — | Prénom, nom, email de connexion, téléphone, préférences de notification |
| POST | [`/api/gestionnaire/profil/mot-de-passe`](#post-apigestionnaireprofilmot-de-passe) | — | Change le mot de passe du gestionnaire connecté |
| GET | [`/api/gestionnaire/tableau-de-bord`](#get-apigestionnairetableau-de-bord) | — | Indicateurs de l'association du gestionnaire connecté (MgDashboard) |
| GET | [`/api/moi/associations/:id`](#get-apimoiassociationsid) | souscripteur | Une association du souscripteur connecté et ses projets. |
| GET | [`/api/moi/associations`](#get-apimoiassociations) | souscripteur | Associations du souscripteur connecté et ses projets dans chacune |
| GET | [`/api/moi`](#get-apimoi) | souscripteur | Fiche du souscripteur connecté (profil). |
| PATCH | [`/api/moi`](#patch-apimoi) | souscripteur | Le souscripteur modifie son email (le téléphone n'est modifiable que par l'association). |
| GET | [`/api/moi/souscriptions/:projetId`](#get-apimoisouscriptionsprojetid) | souscripteur | Détail d'un projet vu par le souscripteur : situation, échéancier, paiements déclarés, contrat |
| GET | [`/api/moi/souscriptions`](#get-apimoisouscriptions) | souscripteur | Projets du souscripteur connecté (accueil, déclaration), avec projet, association, retards et prochaine échéan |
| POST | [`/api/mot-de-passe/code`](#post-apimot-de-passecode) | — | Envoie un code de réinitialisation (SMS ou email) |
| POST | [`/api/mot-de-passe/nouveau`](#post-apimot-de-passenouveau) | — | Enregistre le nouveau mot de passe après vérification du code. |
| POST | [`/api/mot-de-passe/verification`](#post-apimot-de-passeverification) | — | Vérifie le code reçu |
| GET | [`/api/navigation/compteurs`](#get-apinavigationcompteurs) | — | Compteurs des menus pour l'utilisateur connecté. |
| PATCH | [`/api/notifications/:id`](#patch-apinotificationsid) | — | Marque une notification de l'utilisateur connecté comme lue. |
| GET | [`/api/notifications`](#get-apinotifications) | superadmin | Notifications de l'utilisateur connecté, plus récentes d'abord |
| POST | [`/api/notifications/tout-lu`](#post-apinotificationstout-lu) | — | « Tout marquer comme lu » pour l'utilisateur connecté. |
| GET | [`/api/paiements/:id`](#get-apipaiementsid) | — | Détail : souscripteur, projet, association, échéances couvertes, échéancier du souscripteur sur le projet et s |
| POST | [`/api/paiements/:id/annulation`](#post-apipaiementsidannulation) | — | Annule la validation ou le rejet qui vient d'être fait (toast « Annuler ») : le paiement repasse en attente, é |
| POST | [`/api/paiements/:id/rejet`](#post-apipaiementsidrejet) | — | Le gestionnaire rejette un paiement déclaré (motif obligatoire, message au souscripteur) : les échéances couve |
| POST | [`/api/paiements/:id/validation`](#post-apipaiementsidvalidation) | — | Le gestionnaire valide un paiement déclaré, avec éventuellement une répartition ajustée et le montant réelleme |
| GET | [`/api/paiements`](#get-apipaiements) | — | Paiements déclarés, plus récents d'abord (souscripteur connecté : les siens ; gestionnaire : ceux de son assoc |
| GET | [`/api/plans/:id`](#get-apiplansid) | — |  |
| PATCH | [`/api/plans/:id`](#patch-apiplansid) | — | Modification d'un plan (s'applique aux abonnés à leur prochaine échéance). |
| POST | [`/api/plans/:id/archivage`](#post-apiplansidarchivage) | — | Archive le plan : retiré de la landing, les abonnés actuels le conservent. |
| POST | [`/api/plans/:id/desarchivage`](#post-apiplansiddesarchivage) | — | Annule l'archivage (« Annuler » du message de confirmation). |
| POST | [`/api/plans/:id/duplication`](#post-apiplansidduplication) | — | Copie du plan (« Essentiel (copie) »), sans abonnés ni mise en avant. |
| GET | [`/api/plans`](#get-apiplans) | — | Plans d'abonnement (landing et demande : `statut=actif`) |
| POST | [`/api/plans`](#post-apiplans) | — | Nouveau plan (SaPlan en création). |
| GET | [`/api/plateforme/factures`](#get-apiplateformefactures) | — | Facturation globale (aperçu V2 : écran « Bientôt disponible » en V1). |
| GET | [`/api/plateforme/profil`](#get-apiplateformeprofil) | — | Profil du super-admin connecté (SaProfil). |
| PATCH | [`/api/plateforme/profil`](#patch-apiplateformeprofil) | — | Informations personnelles et préférences de notification. |
| POST | [`/api/plateforme/profil/mot-de-passe`](#post-apiplateformeprofilmot-de-passe) | — | Change le mot de passe du super-admin |
| GET | [`/api/plateforme/tableau-de-bord`](#get-apiplateformetableau-de-bord) | — | SaDashboard |
| GET | [`/api/plateforme/utilisateurs`](#get-apiplateformeutilisateurs) | — | Équipe interne de Cotiz (aperçu V2 : écran « Bientôt disponible » en V1). |
| POST | [`/api/projets/:id/cloture`](#post-apiprojetsidcloture) | — | Clôture définitive : projet « Terminé », échéances à venir annulées. |
| GET | [`/api/projets/:id/contrat`](#get-apiprojetsidcontrat) | — | MgProjetContrat : modèle de contrat du projet (verrouillé) et suivi des signatures |
| GET | [`/api/projets/:id/echeances`](#get-apiprojetsidecheances) | — | Grille : une ligne par souscripteur actif avec ses échéances |
| POST | [`/api/projets/:id/import/analyse`](#post-apiprojetsidimportanalyse) | — | Analyse d'un fichier d'import |
| POST | [`/api/projets/:id/import`](#post-apiprojetsidimport) | — | Lance l'import analysé |
| DELETE | [`/api/projets/:id`](#delete-apiprojetsid) | — | Suppression définitive d'un projet sans aucun paiement (MgProjetParametres, zone de danger) |
| GET | [`/api/projets/:id`](#get-apiprojetsid) | — | Détail |
| PATCH | [`/api/projets/:id`](#patch-apiprojetsid) | — | Paramètres modifiables après création (le financement est verrouillé par le contrat). |
| GET | [`/api/projets/:id/rapport`](#get-apiprojetsidrapport) | — | MgProjetRapports : situation par souscripteur, taux cumulé, répartition des statuts |
| DELETE | [`/api/projets/:id/souscripteurs/:souscripteurId`](#delete-apiprojetsidsouscripteurssouscripteurid) | — | Retire un souscripteur du projet |
| GET | [`/api/projets/:id/souscripteurs`](#get-apiprojetsidsouscripteurs) | — | Souscriptions du projet (retirées comprises, `retireLe`) avec le souscripteur |
| POST | [`/api/projets/:id/souscripteurs`](#post-apiprojetsidsouscripteurs) | — | Inscrit un souscripteur (compte existant ou nouveau compte) : souscription « signature attendue », contrat à s |
| POST | [`/api/projets/:id/souscripteurs/recherche`](#post-apiprojetsidsouscripteursrecherche) | — | Avant l'ajout : ce téléphone a-t-il déjà un compte Cotiz ? Numéros mockés (server/mocks/IDENTIFIANTS.md) : un  |
| GET | [`/api/projets/:id/synthese`](#get-apiprojetsidsynthese) | — | Vue d'ensemble gestionnaire (MgProjet) : retardataires, points à traiter, collecte par échéance |
| GET | [`/api/projets`](#get-apiprojets) | — | Par défaut, les projets de l'association du gestionnaire connecté |
| POST | [`/api/projets`](#post-apiprojets) | — | Création d'un projet (MgNouveauProjet) dans l'association du gestionnaire connecté |
| GET | [`/api/relances`](#get-apirelances) | — | Relances de l'association du gestionnaire (MgRelances) : retardataires de ses projets (échéances en retard, mo |
| POST | [`/api/relances`](#post-apirelances) | — | Relance ponctuelle d'un ou plusieurs souscripteurs (notification dans l'espace souscripteur ; SMS et email en  |
| PATCH | [`/api/relances/regles/:id`](#patch-apirelancesreglesid) | — | Active ou désactive une règle de relance automatique. |
| POST | [`/api/session/code`](#post-apisessioncode) | — | Second facteur de l'espace plateforme (V2 dans la spec) |
| POST | [`/api/session/connexion`](#post-apisessionconnexion) | — | Connexion mockée des trois espaces (identifiants : server/mocks/IDENTIFIANTS.md) |
| GET | [`/api/session/moi`](#get-apisessionmoi) | — | Utilisateur de la session mockée (cookie `cotiz_role`), avec l'association courante du gestionnaire (nom, plan |
| POST | [`/api/session/mot-de-passe`](#post-apisessionmot-de-passe) | — | Première connexion : remplace le mot de passe provisoire. |
| GET | [`/api/souscripteurs/:id`](#get-apisouscripteursid) | — | Fiche vue par le gestionnaire : coordonnées, souscriptions aux projets de son association (avec échéances), st |
| PATCH | [`/api/souscripteurs/:id`](#patch-apisouscripteursid) | — | Le gestionnaire modifie l'email ou l'adresse d'un souscripteur (« Modifier » de la fiche) |
| POST | [`/api/souscripteurs/:id/identifiants`](#post-apisouscripteursididentifiants) | — | Renvoie au souscripteur ses identifiants de connexion |
| GET | [`/api/souscripteurs`](#get-apisouscripteurs) | — | Annuaire de l'association (statut global = le pire de ses projets engagés) |

## associations

### GET /api/associations/:id

Détail. Scénario : `etat-suspendue`.

- **Paramètres de route** : `id`
- **Réponse** : `Association`
- **Scénarios** : `etat-suspendue`
- **Erreurs** : 404 — Association introuvable
- **Source** : `frontend/server/api/associations/[id].get.ts`

### PATCH /api/associations/:id

Profil et moyens de paiement de l'association (onboarding étapes 2 et 3, paramètres).

- **Paramètres de route** : `id`
- **Corps** : `ModificationAssociation` (voir annexe)
- **Réponse** : `Association`
- **Erreurs** : 404 — Association introuvable · 422 — Nom obligatoire
- **Source** : `frontend/server/api/associations/[id].patch.ts`

### GET /api/associations/:id/fiche

Détail plateforme (SaAssociation). Scénario : `etat-suspendue`.

- **Paramètres de route** : `id`
- **Réponse** : `FicheAssociationPlateforme`
- **Scénarios** : `etat-suspendue`
- **Erreurs** : 404 — Association introuvable
- **Source** : `frontend/server/api/associations/[id]/fiche.get.ts`

### POST /api/associations/:id/plan

Change le plan de l'association, et la limite de comptes gestionnaires secondaires (« Comptes gestionnaires autorisés », la même que l'écran Équipe du gestionnaire : « 2 sur 3 »).

- **Paramètres de route** : `id`
- **Réponse** : `FicheAssociationPlateforme`
- **Erreurs** : 404 — Association introuvable · 400 — Plan inconnu · 400 — Nombre de comptes invalide
- **Source** : `frontend/server/api/associations/[id]/plan.post.ts`

### POST /api/associations/:id/reactivation

Lève la suspension (retour au statut d'avant, « active » par défaut).

- **Paramètres de route** : `id`
- **Réponse** : `FicheAssociationPlateforme`
- **Erreurs** : 404 — Association introuvable
- **Source** : `frontend/server/api/associations/[id]/reactivation.post.ts`

### POST /api/associations/:id/suspension

Suspend l'association (motif obligatoire) : plus d'accès pour ses membres.

- **Paramètres de route** : `id`
- **Corps** : `SuspensionAssociation` (voir annexe)
- **Réponse** : `FicheAssociationPlateforme`
- **Erreurs** : 404 — Association introuvable · 400 — Motif obligatoire
- **Source** : `frontend/server/api/associations/[id]/suspension.post.ts`

### GET /api/associations

Liste plateforme (SaAssociations) et compteurs des puces (illustratifs). Scénarios : `vide` (aucune association listée).

- **Query** (optionnels) : `statut`, `plan`, `q`
- **Réponse** : `ListeAssociations`
- **Scénarios** : `vide`
- **Source** : `frontend/server/api/associations/index.get.ts`

### POST /api/associations

Création directe par la plateforme (SaNouvelleAssociation), sans demande préalable.

- **Corps** : `NouvelleAssociationPlateforme` (voir annexe)
- **Réponse** : `AssociationListe`
- **Erreurs** : 400 — Association incomplete
- **Source** : `frontend/server/api/associations/index.post.ts`

## contrats

### POST /api/contrats/:id/signature

Le souscripteur signe son contrat (signature électronique horodatée). La souscription passe « À jour » et son échéancier est créé (fonds d'entrée compris).

- **Rôle** : souscripteur
- **Paramètres de route** : `id`
- **Réponse** : 

```ts
{ projet: Projet; souscripteur: Souscripteur; association: Association; id: Identifiant; projetId: Identifiant; souscripteurId: Identifiant; associationId: Identifiant; texte: string; engagement: MontantFCFA; statut: StatutContrat; envoyeLe: DateISO; signeLe?: DateISO; signeParAssociationLe?: DateISO; signataireAssociation?: string; pdfUrl?: string; }
```

- **Erreurs** : 404 — Contrat introuvable · 409 — `deja-signe` · 403 — réservé aux souscripteurs
- **Source** : `frontend/server/api/contrats/[id]/signature.post.ts`

### GET /api/contrats

Souscripteur : défaut = ses contrats. Scénarios : `tout-signe`, `tous-signes`, `aucun-contrat`, `consultation` (MbContrat : Voyage solidaire déjà signé).

- **Query** (optionnels) : `projetId`, `souscripteurId`, `statut`
- **Réponse** : 

```ts
{ projet: Projet; souscripteur: Souscripteur; association: Association; id: Identifiant; projetId: Identifiant; souscripteurId: Identifiant; associationId: Identifiant; texte: string; engagement: MontantFCFA; statut: StatutContrat; envoyeLe: DateISO; signeLe?: DateISO; signeParAssociationLe?: DateISO; signataireAssociation?: string; pdfUrl?: string; }[]
```

- **Scénarios** : `aucun-contrat`, `tout-signe`, `tous-signes`, `consultation`
- **Source** : `frontend/server/api/contrats/index.get.ts`

## declarations

### POST /api/declarations

Le souscripteur déclare un paiement (montant, échéances couvertes, preuve). Le paiement est créé « En attente » ; les échéances couvertes passent « Déclarée » jusqu'à la validation.

- **Rôle** : souscripteur
- **Corps** : `NouvelleDeclaration` (voir annexe)
- **Réponse** : `Paiement`
- **Erreurs** : 404 — Projet introuvable · 409 — `contrat-a-signer` · 422 — `montant-invalide` · 422 — `montant-trop-eleve` · 422 — `repartition-invalide` · 422 — `preuve-manquante` · 403 — réservé aux souscripteurs
- **Source** : `frontend/server/api/declarations/index.post.ts`

## demandes

### GET /api/demandes/:id

Demande et frise (reçue, consultée, décision). La première ouverture la marque consultée. Scénarios : `approuvee`, `refusee` (décision de la maquette : plan Essentiel, 2 comptes ; motif « Informations incomplètes »).

- **Paramètres de route** : `id`
- **Réponse** : `DemandeDetaillee`
- **Scénarios** : `approuvee`, `refusee`
- **Erreurs** : 404 — Demande introuvable
- **Source** : `frontend/server/api/demandes/[id].get.ts`

### POST /api/demandes/:id/approbation

Approuve la demande : crée l'association (onboarding) et son gestionnaire principal.

- **Paramètres de route** : `id`
- **Corps** : `ApprobationDemande` (voir annexe)
- **Réponse** : `DemandeDetaillee`
- **Erreurs** : 404 — Demande introuvable · 409 — `deja_traitee` · 400 — Approbation incomplete
- **Source** : `frontend/server/api/demandes/[id]/approbation.post.ts`

### POST /api/demandes/:id/refus

Refuse la demande avec un motif (obligatoire) et des précisions reprises dans l'email.

- **Paramètres de route** : `id`
- **Corps** : `RefusDemande` (voir annexe)
- **Réponse** : `DemandeDetaillee`
- **Erreurs** : 404 — Demande introuvable · 409 — `deja_traitee` · 400 — Motif obligatoire
- **Source** : `frontend/server/api/demandes/[id]/refus.post.ts`

### GET /api/demandes

Demandes de création (super-admin), plus anciennes d'abord (ordre de traitement). Scénarios : `vide` (aucune à traiter), `aucune-demande` (idem).

- **Query** (optionnels) : `statut`
- **Réponse** : `Demande[]`
- **Scénarios** : `vide`, `aucune-demande`
- **Source** : `frontend/server/api/demandes/index.get.ts`

### POST /api/demandes

Demande de création d'association (formulaire public /demande). Ajoute la demande au store (statut « À traiter ») ; la référence reste le placeholder de la maquette.

- **Corps** : `NouvelleDemande` (voir annexe)
- **Réponse** : `DemandeCreee`
- **Erreurs** : 400 — Demande incomplete
- **Source** : `frontend/server/api/demandes/index.post.ts`

## echeances

### GET /api/echeances

Échéances (souscripteur : défaut = soi-même).

- **Query** (optionnels) : `projetId`, `souscripteurId`, `statut`
- **Réponse** : `Echeance[]`
- **Source** : `frontend/server/api/echeances/index.get.ts`

## gestionnaire

### POST /api/gestionnaire/abonnement/changement

Demande de changement de formule, traitée par l'équipe Cotiz.

- **Rôle** : gestionnaire
- **Réponse** : 

```ts
{ ok: boolean; }
```

- **Erreurs** : 401 — non connecté comme gestionnaire
- **Source** : `frontend/server/api/gestionnaire/abonnement/changement.post.ts`

### GET /api/gestionnaire/abonnement

Formule, utilisation des quotas et factures de l'association. Scénarios : `echeance-proche` (facture en cours à payer), `suspendu` (facture impayée, espace suspendu).

- **Rôle** : gestionnaire
- **Réponse** : `AbonnementAssociation`
- **Scénarios** : `suspendu`, `echeance-proche`
- **Erreurs** : 404 — Association introuvable · 404 — Plan introuvable · 401 — non connecté comme gestionnaire
- **Source** : `frontend/server/api/gestionnaire/abonnement/index.get.ts`

### GET /api/gestionnaire/association

Association du gestionnaire connecté (onboarding, création de projet).

- **Réponse** : `Association`
- **Erreurs** : 404 — Association introuvable
- **Source** : `frontend/server/api/gestionnaire/association.get.ts`

### GET /api/gestionnaire/contrats

Un contrat par projet de l'association (MgContrats) : conditions, signature de l'association, contre-signatures des souscripteurs, non-signataires. Scénario : `aucun-contrat`.

- **Réponse** : `SyntheseContratProjet[]`
- **Scénarios** : `aucun-contrat`
- **Source** : `frontend/server/api/gestionnaire/contrats.get.ts`

### DELETE /api/gestionnaire/equipe/:id

Retire l'accès d'un gestionnaire secondaire (ou annule son invitation).

- **Rôle** : gestionnaire
- **Paramètres de route** : `id`
- **Réponse** : 

```ts
{ ok: boolean; }
```

- **Erreurs** : 404 — Gestionnaire introuvable · 403 — `principal` · 401 — non connecté comme gestionnaire
- **Source** : `frontend/server/api/gestionnaire/equipe/[id].delete.ts`

### POST /api/gestionnaire/equipe/:id/renvoi

Renvoie l'invitation (invité) ou les identifiants (actif) par email.

- **Rôle** : gestionnaire
- **Paramètres de route** : `id`
- **Réponse** : 

```ts
{ envoye: boolean; email: string; type: string; }
```

- **Erreurs** : 404 — Gestionnaire introuvable · 401 — non connecté comme gestionnaire
- **Source** : `frontend/server/api/gestionnaire/equipe/[id]/renvoi.post.ts`

### GET /api/gestionnaire/equipe

Gestionnaires de l'association et quota de comptes secondaires. Scénario : `quota-atteint` (3 comptes secondaires sur 3).

- **Rôle** : gestionnaire
- **Réponse** : `EquipeAssociation`
- **Erreurs** : 401 — non connecté comme gestionnaire
- **Source** : `frontend/server/api/gestionnaire/equipe/index.get.ts`

### POST /api/gestionnaire/equipe

Invite un gestionnaire secondaire (identifiants envoyés par email). Refusé si le quota de comptes secondaires est atteint.

- **Rôle** : gestionnaire
- **Corps** : `InvitationGestionnaire` (voir annexe)
- **Réponse** : `Gestionnaire`
- **Erreurs** : 409 — `quota-atteint` · 422 — `nom-requis` · 422 — `email-invalide` · 409 — `email-existant` · 401 — non connecté comme gestionnaire
- **Source** : `frontend/server/api/gestionnaire/equipe/index.post.ts`

### GET /api/gestionnaire/profil

Informations personnelles et préférences de notification du gestionnaire connecté.

- **Réponse** : `ProfilGestionnaire`
- **Source** : `frontend/server/api/gestionnaire/profil/index.get.ts`

### PATCH /api/gestionnaire/profil

Prénom, nom, email de connexion, téléphone, préférences de notification. Le résumé quotidien par email (V2) ne peut pas être activé.

- **Corps** : `ModificationProfilGestionnaire` (voir annexe)
- **Réponse** : `ProfilGestionnaire`
- **Erreurs** : 422 — `prenom-requis` · 422 — `nom-requis` · 422 — `email-invalide` · 409 — `email-existant`
- **Source** : `frontend/server/api/gestionnaire/profil/index.patch.ts`

### POST /api/gestionnaire/profil/mot-de-passe

Change le mot de passe du gestionnaire connecté. Mot de passe actuel des mocks : `motdepasse` (server/mocks/IDENTIFIANTS.md).

- **Réponse** : `ProfilGestionnaire`
- **Erreurs** : 400 — `mot-de-passe-incorrect` · 422 — `mot-de-passe-faible`
- **Source** : `frontend/server/api/gestionnaire/profil/mot-de-passe.post.ts`

### GET /api/gestionnaire/tableau-de-bord

Indicateurs de l'association du gestionnaire connecté (MgDashboard). Scénarios : `premier-usage` (aucun projet), `tout-est-a-jour` (rien à valider, aucun contrat en souffrance). Collecte du mois et taux de recouvrement : DONNEES-REFERENCE.md. Avril → août : valeurs lues sur les barres de la maquette (seul septembre, 1 240 000 F, est une donnée de référence).

- **Réponse** : `TableauDeBordGestionnaire`
- **Scénarios** : `premier-usage`, `tout-est-a-jour`
- **Erreurs** : 404 — Association introuvable
- **Source** : `frontend/server/api/gestionnaire/tableau-de-bord.get.ts`

## moi

### GET /api/moi/associations/:id

Une association du souscripteur connecté et ses projets.

- **Rôle** : souscripteur
- **Paramètres de route** : `id`
- **Réponse** : `AssociationMembre`
- **Erreurs** : 404 — Association introuvable · 403 — réservé aux souscripteurs
- **Source** : `frontend/server/api/moi/associations/[id].get.ts`

### GET /api/moi/associations

Associations du souscripteur connecté et ses projets dans chacune. Scénario : `une-seule-association`.

- **Rôle** : souscripteur
- **Réponse** : `AssociationMembre[]`
- **Scénarios** : `une-seule-association`
- **Erreurs** : 403 — réservé aux souscripteurs
- **Source** : `frontend/server/api/moi/associations/index.get.ts`

### GET /api/moi

Fiche du souscripteur connecté (profil).

- **Rôle** : souscripteur
- **Réponse** : `Souscripteur`
- **Erreurs** : 404 — Souscripteur introuvable · 403 — réservé aux souscripteurs
- **Source** : `frontend/server/api/moi/index.get.ts`

### PATCH /api/moi

Le souscripteur modifie son email (le téléphone n'est modifiable que par l'association).

- **Rôle** : souscripteur
- **Réponse** : `Souscripteur`
- **Erreurs** : 404 — Souscripteur introuvable · 422 — `email-invalide` · 403 — réservé aux souscripteurs
- **Source** : `frontend/server/api/moi/index.patch.ts`

### GET /api/moi/souscriptions/:projetId

Détail d'un projet vu par le souscripteur : situation, échéancier, paiements déclarés, contrat. Scénarios (MbProjet) : `a-jour`, `paiement-en-attente`, `paiement-rejete`, `termine`.

- **Rôle** : souscripteur
- **Paramètres de route** : `projetId`
- **Réponse** : `DetailSouscriptionMembre`
- **Erreurs** : 404 — Projet introuvable · 403 — réservé aux souscripteurs
- **Source** : `frontend/server/api/moi/souscriptions/[projetId].get.ts`

### GET /api/moi/souscriptions

Projets du souscripteur connecté (accueil, déclaration), avec projet, association, retards et prochaine échéance. Scénarios : `aucun-projet`, `tout-est-paye` (voir server/utils/souscripteur.ts).

- **Rôle** : souscripteur
- **Réponse** : `SouscriptionMembre[]`
- **Erreurs** : 403 — réservé aux souscripteurs
- **Source** : `frontend/server/api/moi/souscriptions/index.get.ts`

## mot-de-passe

### POST /api/mot-de-passe/code

Envoie un code de réinitialisation (SMS ou email). Ne révèle pas si le compte existe.

- **Réponse** : `EnvoiCode`
- **Erreurs** : 400 — Numero a 10 chiffres attendu · 400 — Adresse email invalide · 400 — Profil inconnu
- **Source** : `frontend/server/api/mot-de-passe/code.post.ts`

### POST /api/mot-de-passe/nouveau

Enregistre le nouveau mot de passe après vérification du code.

- **Réponse** : 

```ts
{ ok: true; }
```

- **Erreurs** : 400 — Mot de passe trop faible
- **Source** : `frontend/server/api/mot-de-passe/nouveau.post.ts`

### POST /api/mot-de-passe/verification

Vérifie le code reçu. 123456 valide, 000000 expiré, autre incorrect.

- **Réponse** : 

```ts
{ ok: true; }
```

- **Erreurs** : 410 — `code-expire` · 400 — `code-incorrect`
- **Source** : `frontend/server/api/mot-de-passe/verification.post.ts`

## navigation

### GET /api/navigation/compteurs

Compteurs des menus pour l'utilisateur connecté.

- **Réponse** : `CompteursNavigation`
- **Scénarios** : `file-vide`, `tout-est-a-jour`, `tout-lu`, `aucune-demande`
- **Source** : `frontend/server/api/navigation/compteurs.get.ts`

## notifications

### PATCH /api/notifications/:id

Marque une notification de l'utilisateur connecté comme lue.

- **Paramètres de route** : `id`
- **Réponse** : `Notification`
- **Erreurs** : 404 — Notification introuvable
- **Source** : `frontend/server/api/notifications/[id].patch.ts`

### GET /api/notifications

Notifications de l'utilisateur connecté, plus récentes d'abord. Scénarios : `vide`, `tout-lu`.

- **Rôle** : superadmin
- **Réponse** : `Notification[]`
- **Scénarios** : `vide`, `tout-lu`
- **Erreurs** : 401 — Non connecté
- **Source** : `frontend/server/api/notifications/index.get.ts`

### POST /api/notifications/tout-lu

« Tout marquer comme lu » pour l'utilisateur connecté.

- **Réponse** : 

```ts
{ ok: boolean; }
```

- **Erreurs** : 401 — Non connecté
- **Source** : `frontend/server/api/notifications/tout-lu.post.ts`

## paiements

### GET /api/paiements/:id

Détail : souscripteur, projet, association, échéances couvertes, échéancier du souscripteur sur le projet et ses 3 derniers versements validés. Scénarios (MgPaiement) : `pdf` (reçu PDF), `reference-seule` (référence de transaction sans fichier).

- **Paramètres de route** : `id`
- **Réponse** : `PaiementDetail`
- **Erreurs** : 404 — Paiement introuvable
- **Source** : `frontend/server/api/paiements/[id].get.ts`

### POST /api/paiements/:id/annulation

Annule la validation ou le rejet qui vient d'être fait (toast « Annuler ») : le paiement repasse en attente, échéances, souscription et compteurs reviennent à leur état précédent.

- **Paramètres de route** : `id`
- **Réponse** : `Paiement`
- **Erreurs** : 404 — Paiement introuvable · 409 — `rien_a_annuler` · 403 — Reserve aux gestionnaires
- **Source** : `frontend/server/api/paiements/[id]/annulation.post.ts`

### POST /api/paiements/:id/rejet

Le gestionnaire rejette un paiement déclaré (motif obligatoire, message au souscripteur) : les échéances couvertes retrouvent leur état. Annulable (`/annulation`).

- **Paramètres de route** : `id`
- **Réponse** : `Paiement`
- **Erreurs** : 404 — Paiement introuvable · 409 — `deja_traite` · 422 — `motif_requis` · 403 — Reserve aux gestionnaires
- **Source** : `frontend/server/api/paiements/[id]/rejet.post.ts`

### POST /api/paiements/:id/validation

Le gestionnaire valide un paiement déclaré, avec éventuellement une répartition ajustée et le montant réellement reçu : échéances couvertes créditées (payées ou partielles), échéances retirées de la répartition libérées, souscription et compteurs du projet recalculés. Annulable (`/annulation`).

- **Paramètres de route** : `id`
- **Réponse** : `Paiement`
- **Erreurs** : 404 — Paiement introuvable · 409 — `deja_traite` · 403 — Reserve aux gestionnaires
- **Source** : `frontend/server/api/paiements/[id]/validation.post.ts`

### GET /api/paiements

Paiements déclarés, plus récents d'abord (souscripteur connecté : les siens ; gestionnaire : ceux de son association par défaut). Scénarios : `file-vide` (aucun en attente), `aucun-paiement`.

- **Query** (optionnels) : `statut`, `souscripteurId`, `projetId`, `associationId`
- **Réponse** : `PaiementListe[]`
- **Scénarios** : `aucun-paiement`, `file-vide`
- **Source** : `frontend/server/api/paiements/index.get.ts`

## plans

### GET /api/plans/:id

- **Paramètres de route** : `id`
- **Réponse** : `Plan`
- **Erreurs** : 404 — Plan introuvable
- **Source** : `frontend/server/api/plans/[id].get.ts`

### PATCH /api/plans/:id

Modification d'un plan (s'applique aux abonnés à leur prochaine échéance).

- **Paramètres de route** : `id`
- **Corps** : `ModificationPlan` (voir annexe)
- **Réponse** : `Plan`
- **Erreurs** : 404 — Plan introuvable
- **Source** : `frontend/server/api/plans/[id].patch.ts`

### POST /api/plans/:id/archivage

Archive le plan : retiré de la landing, les abonnés actuels le conservent.

- **Paramètres de route** : `id`
- **Réponse** : `Plan`
- **Erreurs** : 404 — Plan introuvable
- **Source** : `frontend/server/api/plans/[id]/archivage.post.ts`

### POST /api/plans/:id/desarchivage

Annule l'archivage (« Annuler » du message de confirmation).

- **Paramètres de route** : `id`
- **Réponse** : `Plan`
- **Erreurs** : 404 — Plan introuvable
- **Source** : `frontend/server/api/plans/[id]/desarchivage.post.ts`

### POST /api/plans/:id/duplication

Copie du plan (« Essentiel (copie) »), sans abonnés ni mise en avant.

- **Paramètres de route** : `id`
- **Réponse** : `Plan`
- **Erreurs** : 404 — Plan introuvable
- **Source** : `frontend/server/api/plans/[id]/duplication.post.ts`

### GET /api/plans

Plans d'abonnement (landing et demande : `statut=actif`). Scénario : `aucun-plan`.

- **Query** (optionnels) : `statut`
- **Réponse** : `Plan[]`
- **Scénarios** : `aucun-plan`
- **Source** : `frontend/server/api/plans/index.get.ts`

### POST /api/plans

Nouveau plan (SaPlan en création).

- **Corps** : `ModificationPlan` (voir annexe)
- **Réponse** : `Plan`
- **Source** : `frontend/server/api/plans/index.post.ts`

## plateforme

### GET /api/plateforme/factures

Facturation globale (aperçu V2 : écran « Bientôt disponible » en V1).

- **Réponse** : `FacturationPlateforme`
- **Source** : `frontend/server/api/plateforme/factures.get.ts`

### GET /api/plateforme/profil

Profil du super-admin connecté (SaProfil).

- **Réponse** : `ProfilPlateforme`
- **Source** : `frontend/server/api/plateforme/profil/index.get.ts`

### PATCH /api/plateforme/profil

Informations personnelles et préférences de notification.

- **Corps** : `ModificationProfilPlateforme` (voir annexe)
- **Réponse** : `ProfilPlateforme`
- **Erreurs** : 422 — Prenom obligatoire
- **Source** : `frontend/server/api/plateforme/profil/index.patch.ts`

### POST /api/plateforme/profil/mot-de-passe

Change le mot de passe du super-admin. Mot de passe actuel des mocks : `motdepasse` (server/mocks/IDENTIFIANTS.md).

- **Réponse** : `ProfilPlateforme`
- **Erreurs** : 400 — `mot-de-passe-incorrect` · 422 — `mot-de-passe-faible`
- **Source** : `frontend/server/api/plateforme/profil/mot-de-passe.post.ts`

### GET /api/plateforme/tableau-de-bord

SaDashboard. Scénario : `aucune-demande`.

- **Réponse** : `TableauDeBordPlateforme`
- **Scénarios** : `aucune-demande`
- **Source** : `frontend/server/api/plateforme/tableau-de-bord.get.ts`

### GET /api/plateforme/utilisateurs

Équipe interne de Cotiz (aperçu V2 : écran « Bientôt disponible » en V1).

- **Réponse** : `UtilisateurPlateforme[]`
- **Source** : `frontend/server/api/plateforme/utilisateurs.get.ts`

## projets

### POST /api/projets/:id/cloture

Clôture définitive : projet « Terminé », échéances à venir annulées.

- **Paramètres de route** : `id`
- **Réponse** : `Projet`
- **Erreurs** : 404 — Projet introuvable · 409 — `deja_cloture`
- **Source** : `frontend/server/api/projets/[id]/cloture.post.ts`

### GET /api/projets/:id/contrat

MgProjetContrat : modèle de contrat du projet (verrouillé) et suivi des signatures. Scénario : `tous-signes`. Le texte reprend la maquette (engagement du projet, puis clauses à définir par l'association).

- **Paramètres de route** : `id`
- **Réponse** : `ContratProjet`
- **Scénarios** : `tous-signes`
- **Source** : `frontend/server/api/projets/[id]/contrat.get.ts`

### GET /api/projets/:id/echeances

Grille : une ligne par souscripteur actif avec ses échéances. Scénarios : `beaucoup-de-retards`, `aucun-retard`, `termine`.

- **Paramètres de route** : `id`
- **Réponse** : 

```ts
{ souscription: Souscription; souscripteur: Souscripteur; echeances: Echeance[]; }[]
```

- **Source** : `frontend/server/api/projets/[id]/echeances.get.ts`

### POST /api/projets/:id/import/analyse

Analyse d'un fichier d'import. V0 : le fichier n'est pas lu, seul son nom compte (.xlsx ou .csv, sinon `fichier_invalide`) ; le contenu est celui de la maquette (MgImport).

- **Paramètres de route** : `id`
- **Réponse** : `AnalyseImport`
- **Erreurs** : 422 — `fichier_invalide`
- **Source** : `frontend/server/api/projets/[id]/import/analyse.post.ts`

### POST /api/projets/:id/import

Lance l'import analysé. V0 : les lignes du fichier simulé ne sont pas créées dans le store (données fictives absentes des données de référence) ; renvoie le bilan affiché.

- **Paramètres de route** : `id`
- **Réponse** : 

```ts
{ importes: number; invitations: number; canal: "email" | "sms" | "les_deux"; }
```

- **Erreurs** : 422 — `rien_a_importer`
- **Source** : `frontend/server/api/projets/[id]/import/index.post.ts`

### DELETE /api/projets/:id

Suppression définitive d'un projet sans aucun paiement (MgProjetParametres, zone de danger). Dès qu'un paiement a été déclaré ou validé, la suppression est refusée : il faut clôturer le projet.

- **Paramètres de route** : `id`
- **Réponse** : 

```ts
{ supprime: string; }
```

- **Erreurs** : 404 — Projet introuvable · 409 — `paiements_existants`
- **Source** : `frontend/server/api/projets/[id]/index.delete.ts`

### GET /api/projets/:id

Détail. Scénarios (détail gestionnaire) : `aucun-retard`, `termine`.

- **Paramètres de route** : `id`
- **Réponse** : `Projet`
- **Source** : `frontend/server/api/projets/[id]/index.get.ts`

### PATCH /api/projets/:id

Paramètres modifiables après création (le financement est verrouillé par le contrat).

- **Paramètres de route** : `id`
- **Corps** : `ModificationProjet` (voir annexe)
- **Réponse** : `Projet`
- **Erreurs** : 404 — Projet introuvable · 422 — `nom_obligatoire`
- **Source** : `frontend/server/api/projets/[id]/index.patch.ts`

### GET /api/projets/:id/rapport

MgProjetRapports : situation par souscripteur, taux cumulé, répartition des statuts. Scénario : `graphiques-bientot-disponibles` (graphiques avancés en V2). Taux par échéance : valeurs lues sur la courbe de la maquette (100 % → 82 %).

- **Paramètres de route** : `id`
- **Réponse** : `RapportProjet`
- **Source** : `frontend/server/api/projets/[id]/rapport.get.ts`

### DELETE /api/projets/:id/souscripteurs/:souscripteurId

Retire un souscripteur du projet. L'historique (paiements validés) est conservé ; les échéances à venir sont supprimées.

- **Paramètres de route** : `id`, `souscripteurId`
- **Réponse** : `Souscription`
- **Erreurs** : 404 — Projet introuvable · 404 — Souscription introuvable
- **Source** : `frontend/server/api/projets/[id]/souscripteurs/[souscripteurId].delete.ts`

### GET /api/projets/:id/souscripteurs

Souscriptions du projet (retirées comprises, `retireLe`) avec le souscripteur. Scénarios : `aucun-souscripteur`, `tous-signes`.

- **Paramètres de route** : `id`
- **Réponse** : 

```ts
{ souscripteur: Souscripteur; id: Identifiant; souscripteurId: Identifiant; projetId: Identifiant; inscritLe: DateISO; contratId?: Identifiant; contratSigneLe?: DateISO; verse: MontantFCFA; reste: MontantFCFA; engagement: MontantFCFA; statut: StatutSouscription; montantEnRetard: MontantFCFA; retireLe?: DateISO; }[]
```

- **Scénarios** : `aucun-souscripteur`, `tous-signes`
- **Source** : `frontend/server/api/projets/[id]/souscripteurs/index.get.ts`

### POST /api/projets/:id/souscripteurs

Inscrit un souscripteur (compte existant ou nouveau compte) : souscription « signature attendue », contrat à signer, échéances à venir (+ échéances passées à rattraper).

- **Paramètres de route** : `id`
- **Corps** : `NouvelleInscription` (voir annexe)
- **Réponse** : 

```ts
{ souscripteur: Souscripteur; id: Identifiant; souscripteurId: Identifiant; projetId: Identifiant; inscritLe: DateISO; contratId?: Identifiant; contratSigneLe?: DateISO; verse: MontantFCFA; reste: MontantFCFA; engagement: MontantFCFA; statut: StatutSouscription; montantEnRetard: MontantFCFA; retireLe?: DateISO; }
```

- **Erreurs** : 404 — Projet introuvable · 422 — `identite_incomplete` · 409 — `deja_inscrit`
- **Source** : `frontend/server/api/projets/[id]/souscripteurs/index.post.ts`

### POST /api/projets/:id/souscripteurs/recherche

Avant l'ajout : ce téléphone a-t-il déjà un compte Cotiz ? Numéros mockés (server/mocks/IDENTIFIANTS.md) : un souscripteur du projet → `deja_inscrit` ; un compte connu hors projet, ou 01 00 00 00 01 (Ibrahim Touré) → `compte_existant` ; sinon `nouveau`.

- **Paramètres de route** : `id`
- **Réponse** : `ResultatRechercheSouscripteur`
- **Erreurs** : 422 — `telephone_invalide`
- **Source** : `frontend/server/api/projets/[id]/souscripteurs/recherche.post.ts`

### GET /api/projets/:id/synthese

Vue d'ensemble gestionnaire (MgProjet) : retardataires, points à traiter, collecte par échéance. Scénarios : `aucun-retard`, `termine`. Collecte : attendu = souscripteurs × échéance ; reçu des 7 premiers mois lu sur les barres de la maquette.

- **Paramètres de route** : `id`
- **Réponse** : `SyntheseProjet`
- **Scénarios** : `aucun-retard`
- **Source** : `frontend/server/api/projets/[id]/synthese.get.ts`

### GET /api/projets

Par défaut, les projets de l'association du gestionnaire connecté. Scénarios : `vide`, `aucun-projet`, `premier-usage`.

- **Query** (optionnels) : `associationId`, `statut`
- **Réponse** : `Projet[]`
- **Scénarios** : `vide`, `aucun-projet`, `premier-usage`
- **Source** : `frontend/server/api/projets/index.get.ts`

### POST /api/projets

Création d'un projet (MgNouveauProjet) dans l'association du gestionnaire connecté. Projet créé : « Inscriptions ouvertes » (ou « Brouillon » si enregistré comme tel), sans souscripteur.

- **Corps** : `NouveauProjet` (voir annexe)
- **Réponse** : `Projet`
- **Erreurs** : 422 — `projet_incomplet` · 422 — `contrat_non_signe` · 403 — Reserve aux gestionnaires
- **Source** : `frontend/server/api/projets/index.post.ts`

## relances

### GET /api/relances

Relances de l'association du gestionnaire (MgRelances) : retardataires de ses projets (échéances en retard, montant dû, retard depuis, dernière relance), indicateurs, règles automatiques, historique des envois. Scénario : `aucun-retard`.

- **Réponse** : `Relances`
- **Scénarios** : `aucun-retard`
- **Erreurs** : 404 — Association introuvable
- **Source** : `frontend/server/api/relances/index.get.ts`

### POST /api/relances

Relance ponctuelle d'un ou plusieurs souscripteurs (notification dans l'espace souscripteur ; SMS et email en V2). Mock : rien n'est envoyé ; la dernière relance et l'historique des envois sont mis à jour.

- **Réponse** : 

```ts
{ envoyees: number; canal: "sms"; }
```

- **Erreurs** : 422 — Aucun souscripteur a relancer
- **Source** : `frontend/server/api/relances/index.post.ts`

### PATCH /api/relances/regles/:id

Active ou désactive une règle de relance automatique.

- **Paramètres de route** : `id`
- **Réponse** : `RegleRelance`
- **Erreurs** : 404 — Regle introuvable · 403 — Reserve aux gestionnaires
- **Source** : `frontend/server/api/relances/regles/[id].patch.ts`

## session

### POST /api/session/code

Second facteur de l'espace plateforme (V2 dans la spec). Code valide : 481902.

- **Réponse** : `ResultatConnexion`
- **Erreurs** : 401 — `code-incorrect`
- **Source** : `frontend/server/api/session/code.post.ts`

### POST /api/session/connexion

Connexion mockée des trois espaces (identifiants : server/mocks/IDENTIFIANTS.md). Erreurs : 401 `numero-inconnu` · `mot-de-passe-incorrect` · `identifiants-incorrects`, 403 `compte-suspendu`, 423 `blocage`.

- **Réponse** : `ResultatConnexion`
- **Erreurs** : 401 — `numero-inconnu` · 401 — `mot-de-passe-incorrect` · 423 — `blocage` · 403 — `compte-suspendu` · 401 — `identifiants-incorrects` · 400 — Espace de connexion inconnu
- **Source** : `frontend/server/api/session/connexion.post.ts`

### GET /api/session/moi

Utilisateur de la session mockée (cookie `cotiz_role`), avec l'association courante du gestionnaire (nom, plan).

- **Réponse** : `UtilisateurSession`
- **Erreurs** : 401 — Non connecté
- **Source** : `frontend/server/api/session/moi.get.ts`

### POST /api/session/mot-de-passe

Première connexion : remplace le mot de passe provisoire.

- **Réponse** : `ResultatConnexion`
- **Erreurs** : 400 — Mot de passe trop faible
- **Source** : `frontend/server/api/session/mot-de-passe.post.ts`

## souscripteurs

### GET /api/souscripteurs/:id

Fiche vue par le gestionnaire : coordonnées, souscriptions aux projets de son association (avec échéances), statut global, membre depuis, historique complet.

- **Paramètres de route** : `id`
- **Réponse** : `FicheSouscripteur`
- **Erreurs** : 404 — Souscripteur introuvable
- **Source** : `frontend/server/api/souscripteurs/[id].get.ts`

### PATCH /api/souscripteurs/:id

Le gestionnaire modifie l'email ou l'adresse d'un souscripteur (« Modifier » de la fiche). Le téléphone, identifiant de connexion, n'est pas modifiable.

- **Paramètres de route** : `id`
- **Corps** : `ModificationSouscripteur` (voir annexe)
- **Réponse** : `FicheSouscripteur`
- **Erreurs** : 404 — Souscripteur introuvable · 422 — `email-invalide` · 403 — Reserve aux gestionnaires
- **Source** : `frontend/server/api/souscripteurs/[id].patch.ts`

### POST /api/souscripteurs/:id/identifiants

Renvoie au souscripteur ses identifiants de connexion. Mock : rien n'est envoyé.

- **Paramètres de route** : `id`
- **Réponse** : 

```ts
{ envoye: boolean; canal: "sms"; telephone: string; }
```

- **Erreurs** : 404 — Souscripteur introuvable · 403 — Reserve aux gestionnaires
- **Source** : `frontend/server/api/souscripteurs/[id]/identifiants.post.ts`

### GET /api/souscripteurs

Annuaire de l'association (statut global = le pire de ses projets engagés). Scénario : `vide`.

- **Query** (optionnels) : `associationId`
- **Réponse** : `SouscripteurAnnuaire[]`
- **Scénarios** : `vide`
- **Source** : `frontend/server/api/souscripteurs/index.get.ts`

## Annexe — types

Recopiés de `frontend/types/` (source de vérité). Seuls les types utilisés par les corps et les réponses figurent ici.

### api.ts

```ts
/** Fiche d'un souscripteur vue par le gestionnaire (`GET /api/souscripteurs/:id`), limitée à son association. */
export interface FicheSouscripteur {
  /** Coordonnées vues par l'association (placeholders `[email]` de la maquette compris). */
  souscripteur: Souscripteur
  souscriptions: (SouscriptionAvecProjet & { echeances: Echeance[] })[]
  /** Statut global : le pire de ses projets engagés. */
  statutGlobal: StatutSouscription
  /** Première inscription à un projet de l'association. */
  membreDepuis: DateISO
  /** Frise complète, plus récent d'abord : paiements, validations, retards et relances, contrats. */
  historique: EvenementSouscripteur[]
}

/** Événement de la frise d'historique d'un souscripteur (fiche gestionnaire). */
export interface EvenementSouscripteur {
  id: Identifiant
  /** Date ISO, ou placeholder `[DATE]` de la maquette. */
  date: DateISO
  titre: string
  detail?: string
  ton: 'success' | 'warning' | 'danger' | 'info' | 'brand'
}

export type SouscriptionAvecProjet = Souscription & { projet: Projet }

/** Corps de `PATCH /api/souscripteurs/:id` (« Modifier » de la fiche). */
export type ModificationSouscripteur = Partial<Pick<Souscripteur, 'email' | 'adresse'>>

/** Règle de relance automatique (onglet Relances automatiques). */
export interface RegleRelance {
  id: Identifiant
  titre: string
  description: string
  ton: 'info' | 'warning' | 'danger'
  active: boolean
}

/** `GET /api/relances` — relances de l'association du gestionnaire. */
export interface Relances {
  retardataires: LigneRetard[]
  /** Souscripteurs en retard / actifs (KPI « 14 sur 52 »). */
  nbEnRetard: number
  nbActifs: number
  /** Cumul des échéances non payées (placeholder de la maquette). */
  montantEnRetard: MontantFCFA | '[MONTANT]'
  derniereAuto?: { date: DateISO, regle: string, envois: number }
  regles: RegleRelance[]
  historique: EnvoiRelance[]
}

/** Envoi de relances (onglet Historique des envois). */
export interface EnvoiRelance {
  id: Identifiant
  date: DateISO
  type: 'automatique' | 'manuelle'
  projet: string
  destinataires: number | '[N]'
  /** « Cotiz · règle « 15 jours » », « Awa Koné ». */
  par: string
}

// ---------------------------------------------------------------- Relances (gestionnaire)

/** Souscripteur en retard sur un projet (onglet Retardataires de MgRelances). */
export interface LigneRetard {
  souscripteurId: Identifiant
  nom: string
  telephone: string
  projetId: Identifiant
  nomProjet: string
  /** Échéances en retard, de la plus ancienne à la plus récente (partielles comprises). */
  echeances: { date: DateISO, partielle: boolean }[]
  montant: MontantFCFA
  retardDepuis: DateISO
  derniereRelance?: { type: 'auto' | 'manuelle', date: DateISO }
}

/** Corps de `POST /api/projets` (création en 6 étapes). */
export type NouveauProjet = Pick<Projet,
  'nom' | 'description' | 'fondsEntree' | 'montantEcheance' | 'frequence' | 'jourEcheance'
  | 'typeCalendrier' | 'dateDebut' | 'dateFin' | 'delaiGraceJours' | 'souscripteursRequis'
  | 'modalitesPaiement' | 'instructionsPaiement' | 'contratModele'
> & {
  signataire: { nom: string, fonction: string }
  /** Case « Je signe ce contrat au nom de l'association ». */
  contratSigne: boolean
  /** Enregistrement comme brouillon (« Enregistrer le brouillon »). */
  brouillon?: boolean
}

/** Vue d'ensemble d'un projet (`GET /api/projets/:id/synthese`). */
export interface SyntheseProjet {
  /** Tous les retardataires, du plus gros montant au plus petit (la page en montre 5). */
  retardataires: Retardataire[]
  paiementsAValider: { nombre: number, plusAncienLe?: DateISO }
  contratsNonSignes: { souscripteurId: Identifiant, nom: string, inscritLe: DateISO }[]
  /** Une entrée par échéance du calendrier (hors fonds d'entrée) : attendu et reçu, tous souscripteurs. */
  collecte: CollecteMois[]
}

// ---------------------------------------------------------------- Espace gestionnaire

/** Mois du graphique « Collecte mensuelle — attendu vs reçu » (tous projets). */
export interface CollecteMois {
  /** Premier jour du mois (`2026-09-01`). */
  mois: DateISO
  attendu: MontantFCFA
  recu: MontantFCFA
  enCours?: boolean
}

// ---------------------------------------------------------------- Détail d'un projet (gestionnaire)

/** Souscripteur en retard (vue d'ensemble : « Retardataires »). */
export interface Retardataire {
  souscripteurId: Identifiant
  nom: string
  nbEcheances: number
  montant: MontantFCFA
  /** Mois des échéances en retard (« août », « septembre »). */
  mois: string[]
}

/** Recherche d'un téléphone avant l'ajout d'un souscripteur. */
export type ResultatRechercheSouscripteur
  = | { cas: 'nouveau' }
    | { cas: 'compte_existant', souscripteur: Souscripteur, nbAssociations: number, projets: string[] }
    | { cas: 'deja_inscrit', souscripteur: Souscripteur }

/** Corps de `POST /api/projets/:id/souscripteurs`. */
export interface NouvelleInscription {
  telephone: string
  /** Compte existant retrouvé : pas de nouveau compte. */
  souscripteurId?: Identifiant
  prenom?: string
  nom?: string
  email?: string
  adresse?: string
  canal?: 'sms' | 'email'
  /** Date d'entrée dans le projet (inscription en cours de route). */
  dateEntree?: DateISO
  /** Rangs des échéances passées à rattraper (0 = fonds d'entrée). */
  rattrapage?: number[]
}

export interface RapportProjet {
  lignes: LigneRapport[]
  /** Taux de recouvrement cumulé après chaque échéance échue, en %. */
  tauxParEcheance: { mois: DateISO, taux: number }[]
  statuts: { aJour: number, enRetard: number, signature: number }
  /** V1 : graphiques avancés pas encore disponibles (état « Bientôt disponible »). */
  graphiquesDisponibles: boolean
}

/** Ligne du tableau des rapports (`GET /api/projets/:id/rapport`). */
export interface LigneRapport {
  souscripteurId: Identifiant
  nom: string
  attenduADate: MontantFCFA | null
  verse: MontantFCFA
  reste: MontantFCFA | null
  retards: number
  dernierPaiement?: DateISO
}

/** Corps de `PATCH /api/projets/:id` (paramètres modifiables après création). */
export type ModificationProjet = Partial<Pick<Projet,
  'nom' | 'description' | 'imageCouvertureNom' | 'souscripteursRequis' | 'modalitesPaiement' | 'instructionsPaiement' | 'delaiGraceJours'
>>

/** Résultat de `POST /api/projets/:id/import/analyse` (fichier simulé en V0). */
export interface AnalyseImport {
  fichier: string
  nbLignes: number
  colonnes: { colonne: string, exemples: string[], champ: 'prenom' | 'nom' | 'telephone' | 'email' | 'adresse' | null }[]
  compteurs: { pretes: number, comptesExistants: number, erreurs: number, doublons: number }
  /** Lignes à examiner (erreurs, doublons) et exemples de lignes prêtes. */
  lignes: LigneImport[]
}

/** Ligne d'un fichier d'import analysé. */
export interface LigneImport {
  ligne: number
  prenom: string
  nom: string
  telephone: string
  email?: string
  adresse?: string
  statut: 'prete' | 'compte_existant' | 'telephone_incomplet' | 'prenom_manquant' | 'doublon'
  /** Doublon : ligne d'origine. */
  doublonDe?: number
}

/** Contrat d'un projet vu par le gestionnaire (`GET /api/projets/:id/contrat`) : modèle commun et suivi des signatures. */
export interface ContratProjet {
  association: { nom: string, ville?: string }
  /** Texte du modèle, variables du projet remplacées ; `{nom_souscripteur}` reste tel quel. `**…**` = gras. */
  texte: string
  /** Signature de l'association à la création du projet. */
  signataire?: { nom: string, fonction?: string, signeLe: DateISO }
  /** `[N]` tant que le nombre de souscripteurs est un placeholder (Voyage solidaire). */
  signes: number | '[N]'
  total: number | '[N]'
  nonSignataires: { souscripteurId: Identifiant, nom: string, inscritLe: DateISO }[]
}

export type PaiementListe = Paiement & {
  souscripteur: Souscripteur
  projet: Projet
  /** « Validé par » : nom du gestionnaire. */
  traiteParNom?: string
  /** Échéances de la répartition (libellés « Couvre : sept., oct., nov. 2026 »). */
  echeancesCouvertes: Echeance[]
}

export type PaiementDetail = PaiementListe & {
  /** Échéances couvertes (identique à `echeancesCouvertes`). */
  echeances: Echeance[]
  association: Association
  souscription?: Souscription
  /** Toutes les échéances du souscripteur sur le projet, dans l'ordre (situation, ajustement de la répartition). */
  echeancier: Echeance[]
  /** 3 derniers versements validés, hors ce paiement, du plus récent au plus ancien. */
  derniersVersements: VersementValide[]
}

/** Versement validé affiché dans la frise du détail d'un paiement (« 25 000 F validé · 05/08/2026 · août »). */
export interface VersementValide {
  echeanceId: Identifiant
  date: DateISO
  montant: MontantFCFA
  /** Gestionnaire qui a validé le paiement correspondant, s'il est connu. */
  traiteParNom?: string
}

export type SouscriptionMembre = SouscriptionComplete & SituationSouscription

// ---------------------------------------------------------------- Espace souscripteur (`/api/moi/...`)

/** Situation d'une souscription calculée à partir de ses échéances (cartes projet, associations). */
export interface SituationSouscription {
  nbEcheancesEnRetard: number
  /** Date de la plus ancienne échéance en retard (« depuis le 5 août »). */
  retardDepuis?: DateISO
  /** Prochaine échéance à venir. */
  prochaine?: { date: DateISO, montant: MontantFCFA }
}

export type SouscriptionComplete = Souscription & { projet: Projet, association: Association }

/** Détail d'un projet vu par le souscripteur (`/api/moi/souscriptions/:projetId`). */
export type DetailSouscriptionMembre = SouscriptionMembre & {
  echeances: Echeance[]
  /** Paiements déclarés sur ce projet, plus récents d'abord. */
  paiements: Paiement[]
  contrat?: Contrat
}

/** Association du souscripteur et ses projets (`/api/moi/associations`). */
export interface AssociationMembre {
  association: Association
  /** Date de la première inscription à un projet de l'association. */
  membreDepuis: DateISO
  souscriptions: SouscriptionMembre[]
}

/** Tableau de bord gestionnaire (`GET /api/gestionnaire/tableau-de-bord`). */
export interface TableauDeBordGestionnaire {
  association: { id: Identifiant, nom: string }
  /** Mois en cours, tous projets. */
  collecteMois: { collecte: MontantFCFA, attendu: MontantFCFA }
  paiementsAValider: { nombre: number, plusAncienLe?: DateISO }
  enRetard: { nombre: number, actifs: number }
  tauxRecouvrement: number
  nbSouscripteurs: number
  nbProjets: number
  /** Contrats non signés depuis plus de 7 jours. */
  contratsNonSignes: ContratEnSouffrance[]
  /** 6 derniers mois, le dernier est le mois en cours. */
  collecteMensuelle: CollecteMois[]
}

/** Contrat envoyé et toujours pas signé (bandeau « À faire » du tableau de bord). */
export interface ContratEnSouffrance {
  contratId: Identifiant
  souscripteurId: Identifiant
  nomSouscripteur: string
  projetId: Identifiant
  nomProjet: string
}

/** Profil du gestionnaire connecté (`GET /api/gestionnaire/profil`). */
export interface ProfilGestionnaire {
  id: Identifiant
  prenom: string
  nom: string
  email: string
  telephone?: string
  role: RoleGestionnaire
  associationNom: string
  motDePasseModifieLe: DateISO
  preferences: PreferencesGestionnaire
}

/** Préférences de notification du gestionnaire (MgProfil). Le résumé quotidien par email arrive en V2. */
export interface PreferencesGestionnaire {
  paiementDeclare: boolean
  contratSigne: boolean
  resumeQuotidien: boolean
}

export type ModificationProfilGestionnaire = Partial<Pick<ProfilGestionnaire, 'prenom' | 'nom' | 'email' | 'telephone' | 'preferences'>>

/** Corps de `POST /api/gestionnaire/equipe` : le rôle est toujours « secondaire » (MgEquipe). */
export interface InvitationGestionnaire {
  prenom: string
  nom: string
  email: string
  telephone?: string
}

// ---------------------------------------------------------------- Équipe, abonnement, profil (gestionnaire)

/** Équipe de l'association (`GET /api/gestionnaire/equipe`). */
export interface EquipeAssociation {
  membres: Gestionnaire[]
  /** Comptes secondaires (hors gestionnaire principal) : utilisés / limite fixée par la plateforme. */
  comptesSecondaires: { utilises: number, limite: number }
}

// ---------------------------------------------------------------- Contrats (gestionnaire)

/** Contrat d'un projet vu depuis la page Contrats (`GET /api/gestionnaire/contrats`) : conditions et suivi des signatures. */
export interface SyntheseContratProjet {
  projetId: Identifiant
  nomProjet: string
  /** « 50 000 F à l'entrée, puis 25 000 F par mois pendant 18 mois. Total : 500 000 F. » */
  conditions: string
  /** Signature de l'association : signataire et date (ou `[DATE]`). */
  signeParAssociation: { nom: string, le: DateISO }
  signes: number | '[N]'
  total: number | '[N]'
  /** Cycle roulant aux inscriptions ouvertes : places du cycle (« 12 / 30 places »). */
  places?: number
  /** Contre-signatures attendues ; null quand le projet n'en attend pas (inscriptions ouvertes). */
  enAttente: number | '[N]' | null
  statut: 'actif' | 'signatures_en_cours' | 'inscriptions_ouvertes'
  nonSignataires: { souscripteurId: Identifiant, nom: string, inviteLe: DateISO }[]
}

/** Abonnement de l'association (`GET /api/gestionnaire/abonnement`). */
export interface AbonnementAssociation {
  planId: Identifiant
  nomPlan: string
  prixAnnuel: MontantFCFA | '[PRIX]'
  statut: StatutAbonnement
  clientDepuis: DateISO
  prochaineFacture: DateISO
  /** « Virement ou mobile money à Cotiz ». */
  moyenPaiement: string
  utilisation: { projets: UtilisationQuota, souscripteurs: UtilisationQuota, gestionnaires: UtilisationQuota }
  factures: FactureAbonnement[]
  /** Échéance proche / suspendu : facture à régler et date limite. */
  factureDue?: { numero: string, echeance: DateISO }
  emailContactCotiz: string
  /** « Demander un changement » déjà envoyé. */
  changementDemande: boolean
}

/** Facture de l'abonnement Cotiz (réglée par l'association à la plateforme). */
export interface FactureAbonnement {
  id: Identifiant
  numero: string // `[N° FACTURE]`
  periode: string // `[PÉRIODE EN COURS]`
  emiseLe: DateISO
  montant: MontantFCFA | '[MONTANT]'
  statut: StatutFactureAbonnement
}

export type StatutFactureAbonnement = 'payee' | 'a_payer' | 'impayee'

/** Jauge d'utilisation d'un quota. `pourcentage` : remplissage de la barre (la limite peut être un placeholder). */
export interface UtilisationQuota {
  utilise: number
  /** `null` : illimité. */
  limite: Quota
  pourcentage: number
}

export type StatutAbonnement = 'actif' | 'echeance_proche' | 'suspendu'

/** Corps de `POST /api/declarations`. */
export interface NouvelleDeclaration {
  projetId: Identifiant
  montant: MontantFCFA
  repartition: RepartitionEcheance[]
  moyen: MoyenPaiement
  dateVirement: DateISO
  preuve: Preuve
  commentaire?: string
}

/** Corps de `PATCH /api/associations/:id` (onboarding étapes 2 et 3, paramètres). */
export type ModificationAssociation = Partial<Pick<Association,
  'nom' | 'description' | 'ville' | 'telephoneContact' | 'emailContact' | 'logoUrl' | 'modalitesPaiement' | 'instructionsPaiement'
>>

```

### association.ts

```ts
/** Moyen de paiement configuré par l'association (onboarding étape 3, paramètres, étape 4 d'un projet). */
export interface ModalitePaiement {
  moyen: MoyenPaiement
  iban?: string // virement bancaire
  numeroMobileMoney?: string // mobile money
  operateur?: string // mobile money (Orange, MTN, Moov, Wave… — liste non fixée)
  instructions?: string // espèces, ou consignes libres
}

/** Type déclaré à la demande (liste ouverte dans la spec : « association, mutuelle, tontine, groupement… »). */
export type TypeAssociation = 'association' | 'mutuelle' | 'tontine' | 'groupement' | 'autre'

export interface Association {
  id: Identifiant // ex. `entraide-yopougon`
  nom: string
  sigle?: string // incertain : initiales « EY » peut-être calculées depuis le nom
  type?: TypeAssociation
  ville: string
  pays: string // incertain : toujours « Côte d'Ivoire » dans les maquettes
  description?: string
  logoUrl?: string
  telephoneContact?: string
  emailContact?: string
  numeroEnregistrement?: string
  statut: StatutAssociation
  planId: Identifiant
  /** Prochaine échéance d'abonnement (carte « Abonnement »). */
  abonnementProchaineEcheance?: DateISO
  modalitesPaiement: ModalitePaiement[]
  /** Consignes libres montrées aux souscripteurs (MgParametres, « Instructions complémentaires »). */
  instructionsPaiement?: string
  // Compteurs dénormalisés, affichés dans les listes (super-admin, souscripteur).
  nbProjets: number
  nbSouscripteurs: number
  nbGestionnaires: number
  /** Comptes gestionnaires secondaires autorisés, fixés par la plateforme (MgEquipe : « 2 sur 3 »). */
  limiteComptesSecondaires?: number
  creeeLe: DateISO
}

/** Badges : Active · Impayé · Suspendue · Onboarding. */
export type StatutAssociation = 'active' | 'impayee' | 'suspendue' | 'onboarding'

export type RoleGestionnaire = 'principal' | 'secondaire'

/** Compte gestionnaire d'une association (écran Équipe). */
export interface Gestionnaire {
  id: Identifiant
  associationId: Identifiant
  prenom: string
  nom: string
  fonction?: string // ex. « trésorière »
  email: string
  telephone?: string
  role: RoleGestionnaire
  /** MgEquipe : « Actif » ou « Invitation envoyée » (jamais connecté). */
  statut: 'actif' | 'invite'
  /** `null` : jamais connecté. */
  derniereConnexion?: DateISO | null
}

```

### commun.ts

```ts
/** Montant en francs CFA, entier (pas de décimales). Affichage via formatFCFA(). */
export type MontantFCFA = number

export type Identifiant = string

/** Date ISO 8601 (`2026-10-05` ou `2026-10-05T09:30:00Z`). Formatage français côté front. */
export type DateISO = string

export type MoyenPaiement = 'virement' | 'mobile_money' | 'especes'

export type Frequence = 'hebdomadaire' | 'mensuelle' | 'trimestrielle' | 'semestrielle' | 'annuelle'

/** Rôle de la session mockée (cookie `cotiz_role`). */
export type Role = 'souscripteur' | 'gestionnaire' | 'superadmin'

/**
 * Limite d'un quota de plan. `null` = illimité (case « illimité » de SaPlan).
 * Les maquettes affichent `[N]` pour les plans Découverte et Essentiel : on garde la chaîne telle quelle.
 */
export type Quota = number | null | '[N]'

```

### contrat.ts

```ts
export interface Contrat {
  id: Identifiant
  projetId: Identifiant
  souscripteurId: Identifiant
  associationId: Identifiant
  /** Texte final, variables du modèle remplacées. */
  texte: string
  engagement: MontantFCFA // ex. 500 000 F (Centre), 170 000 F (Voyage)
  statut: StatutContrat
  envoyeLe: DateISO
  signeLe?: DateISO
  /** Signature de l'association à la création du projet (« Je signe ce contrat au nom de l'association »). */
  signeParAssociationLe?: DateISO
  /** Signataire pour l'association (« Awa Koné, trésorière »). */
  signataireAssociation?: string
  pdfUrl?: string
}

/** Incertain : les maquettes montrent « Signature attendue » / « Signé » ; pas d'état « refusé » vu. */
export type StatutContrat = 'a_signer' | 'signe'

```

### demande.ts

```ts
export interface Demande {
  id: Identifiant
  /** Numéro de référence affiché en police mono (confirmation, SaDemande). Format non fixé. */
  reference: string
  recueLe: DateISO
  statut: StatutDemande

  // Étape 1 — L'association
  association: {
    nom: string
    type: TypeAssociation
    ville: string
    pays: string
    numeroEnregistrement?: string
    description: string // 500 caractères max
  }

  // Étape 2 — Le responsable
  responsable: {
    prenom: string
    nom: string
    fonction: string
    email: string
    telephone: string
  }

  // Étape 3 — Vos besoins
  besoins: {
    souscripteursEstimes: string // sélecteur par tranches ; libellés des tranches à reprendre de la maquette
    projetsEnvisages: string // tranche du sélecteur (« 1 », « 2 à 3 »…) ; `[N]` dans les données de référence
    planSouhaiteId: Identifiant
    source: string // « Comment avez-vous connu Cotiz ? »
  }
  cguAcceptees: boolean

  // Décision (super-admin)
  planAttribueId?: Identifiant
  decideLe?: DateISO
  decidePar?: Identifiant
  motifRefus?: string // liste de motifs (modale de refus)
  precisionsRefus?: string // texte libre, repris dans l'email
  refusEnvoyeLe?: DateISO
  comptesGestionnaires?: number
  debutAbonnement?: DateISO
  noteInterne?: string // non visible par l'association
  associationId?: Identifiant // créée à l'approbation
  /** Première consultation par le super-admin (frise « Consultée par Richy »). */
  consulteeLe?: DateISO
}

/** Demande de création d'association. Badges : À traiter · Approuvée · Refusée. */
export type StatutDemande = 'a_traiter' | 'approuvee' | 'refusee'

/** Réponse de `POST /api/demandes`. */
export interface DemandeCreee {
  id: Identifiant
  reference: string
  /** Adresse à laquelle la réponse sera envoyée (page de confirmation). */
  email: string
}

/** Corps de `POST /api/demandes` (formulaire public `/demande`). */
export type NouvelleDemande = Pick<Demande, 'association' | 'responsable' | 'besoins' | 'cguAcceptees'>

```

### echeance.ts

```ts
export interface Echeance {
  id: Identifiant
  projetId: Identifiant
  souscripteurId: Identifiant
  /** Rang dans la grille. 0 = fonds d'entrée (1re cellule), puis 1..n. */
  rang: number
  estFondsEntree: boolean
  date: DateISO // date d'exigibilité (le 5 du mois pour Centre communautaire)
  montant: MontantFCFA
  montantPaye: MontantFCFA // validé ; < montant si partielle
  statut: StatutEcheance
}

/**
 * Badges : À venir · Déclarée · Payée · Partielle · En retard.
 * Codes de la grille de la maquette : `f` a_venir · `W` declaree · `o` payee · `P` partielle · `l` en_retard.
 */
export type StatutEcheance = 'a_venir' | 'declaree' | 'payee' | 'partielle' | 'en_retard'

/** Affectation d'une partie d'un paiement à une échéance (sélecteur d'échéances couvertes). */
export interface RepartitionEcheance {
  echeanceId: Identifiant
  montantAffecte: MontantFCFA // < montant de l'échéance => « partielle »
}

```

### notification.ts

```ts
// « 12 / 30 inscrits » (gestionnaire)

export interface Notification {
  id: Identifiant
  destinataireId: Identifiant
  type: TypeNotification
  titre: string // « Paiement validé »
  message: string // « Entraide Yopougon a confirmé la réception de 75 000 F »
  creeeLe: DateISO // groupement Aujourd'hui / Cette semaine / Plus ancien
  lue: boolean
  /** Route de l'écran d'action ouvert au clic. */
  lien?: string
  /** Libellé du bouton d'action (« Signer le contrat », « Vérifier et valider »). */
  libelleAction?: string
}

/** Incertain : liste déduite des exemples (spec 4.11, MbNotifications, MgNotifications). */
export type TypeNotification
  = | 'echeance_proche'
    | 'echeance_en_retard'
    | 'paiement_declare'
    | 'paiement_valide'
    | 'paiement_rejete'
    | 'contrat_a_signer'
    | 'contrat_signe'
    | 'relance'
    | 'abonnement'
    | 'inscriptions'

```

### paiement.ts

```ts
/** Déclaration de paiement d'un souscripteur, vérifiée puis validée ou rejetée par un gestionnaire. */
export interface Paiement {
  id: Identifiant
  souscripteurId: Identifiant
  projetId: Identifiant
  associationId: Identifiant
  montant: MontantFCFA // montant déclaré
  /** Saisi par le gestionnaire via « Le montant reçu est différent ». */
  montantRecu?: MontantFCFA
  moyen: MoyenPaiement
  dateVirement?: DateISO // incertain : date indiquée par le souscripteur (« vers le 10 septembre »)
  declareLe: DateISO
  preuve: Preuve
  /** Commentaire libre du souscripteur (« versement fait par mon frère »). */
  commentaire?: string
  repartition: RepartitionEcheance[]
  /** true si le gestionnaire a modifié la répartition proposée. */
  repartitionAjustee: boolean
  statut: StatutPaiement
  traiteLe?: DateISO
  traitePar?: Identifiant // gestionnaire (« validé par Aminata K. »)
  motifRejet?: MotifRejet
  messageRejet?: string
}

/** Motifs proposés dans la modale de rejet. */
export type MotifRejet = 'preuve_illisible' | 'montant_non_recu' | 'montant_different' | 'autre'

/** Paiement déclaré. Badges : En attente · Validé · Rejeté. */
export type StatutPaiement = 'en_attente' | 'valide' | 'rejete'

/** Preuve jointe : image, PDF, ou seulement une référence de transaction. */
export type Preuve
  = | { type: 'image', nomFichier: string, url: string, reference?: string }
    | { type: 'pdf', nomFichier: string, url: string, reference?: string }
    | { type: 'reference', reference: string }

```

### plan.ts

```ts
export interface Plan {
  id: Identifiant
  nom: string // Découverte, Essentiel, Pro
  /** Phrase affichée sous le nom sur la carte tarif (SaPlan). */
  description?: string
  /** Prix non fournis : `[PRIX]` dans toutes les maquettes. */
  prixMensuel: MontantFCFA | '[PRIX]'
  prixAnnuel: MontantFCFA | '[PRIX]'
  quotas: {
    projets: Quota // projets actifs
    souscripteurs: Quota
    gestionnaires: Quota
  }
  fonctionnalites: string[] // liste cochée des cartes de tarif (landing, étape 3 de /demande)
  associationsAbonnees: number
  /** Plan mis en avant sur la landing (« Le plus choisi », étoile dans SaPlans). */
  misEnAvant: boolean
  statut: StatutPlan
}

export type StatutPlan = 'actif' | 'archive'

```

### plateforme.ts

```ts
/** `GET /api/plateforme/utilisateurs` (aperçu V2). */
export interface UtilisateurPlateforme {
  id: Identifiant
  nom: string
  email: string
  role: RolePlateforme
  /** `null` : jamais connecté ; placeholder `[date]` de la maquette. */
  derniereConnexion: DateISO | null
  statut: 'actif' | 'invite'
}

export type RolePlateforme = 'proprietaire' | 'administrateur' | 'support'

/** `GET /api/plateforme/tableau-de-bord` (SaDashboard). */
export interface TableauDeBordPlateforme {
  demandesATraiter: number
  /** Les 3 plus anciennes demandes à traiter. */
  demandesPrioritaires: Demande[]
  kpi: {
    associationsActives: number
    nouvellesCeMois: number
    souscripteurs: ChiffreOuPlaceholder
    revenuMensuel: ChiffreOuPlaceholder
    abonnementsAJour: number
    abonnementsImpayes: number
    totalAssociations: number
  }
  /** Associations actives sur 12 mois (données illustratives), du plus ancien au plus récent. */
  evolution: { mois: DateISO, valeur: number }[]
  /** Répartition par plan (données illustratives). */
  repartition: { planId: Identifiant, nom: string, nombre: number }[]
  aSurveiller: AssociationASurveiller[]
  activite: EvenementPlateforme[]
}

export interface EvenementPlateforme {
  id: Identifiant
  titre: string
  /** Détail affiché sous le titre (« Jeunesse solidaire de Bouaké · 24 sept. »). */
  detail: string
  ton: TonEvenement
}

/** Pastille d'un événement de frise (Frise). */
export type TonEvenement = 'success' | 'warning' | 'danger' | 'info' | 'brand'

export interface AssociationASurveiller {
  associationId: Identifiant
  nom: string
  signal: SignalAssociation
  /** `null` : sans date (« — »). */
  depuis: DateISO | null
}

export type SignalAssociation = 'impaye' | 'onboarding' | 'quota'

/** Valeur chiffrée ou placeholder de la maquette (`[N]`, `[MONTANT]`). */
export type ChiffreOuPlaceholder = number | '[N]' | '[MONTANT]'

/** `GET /api/plateforme/profil` (SaProfil). */
export interface ProfilPlateforme {
  prenom: string
  nom: string
  email: string
  role: RolePlateforme
  preferences: { nouvelleDemande: boolean, abonnementImpaye: boolean, nouvelleAssociation: boolean, resumeHebdomadaire: boolean }
}

export type ModificationProfilPlateforme = Partial<Pick<ProfilPlateforme, 'prenom' | 'nom' | 'email' | 'preferences'>>

/** `GET /api/plateforme/factures` (aperçu V2). */
export interface FacturationPlateforme {
  kpi: { revenuMois: ChiffreOuPlaceholder, abonnements: number, encaisse: ChiffreOuPlaceholder, facturesPayees: number, enAttente: ChiffreOuPlaceholder, impaye: ChiffreOuPlaceholder, associationsImpayees: number }
  factures: FacturePlateforme[]
}

export interface FacturePlateforme {
  id: Identifiant
  numero: string
  associationId: Identifiant
  associationNom: string
  periode: DateISO
  montant: MontantFCFA | '[PRIX]'
  emiseLe: DateISO | null
  echeance: DateISO
  statut: StatutFacture
}

// ---------------------------------------------------------------- V2 (aperçus)
export type StatutFacture = 'a_venir' | 'en_attente' | 'payee' | 'impayee'

/** Corps de `POST /api/plans` et `PATCH /api/plans/:id`. */
export type ModificationPlan = Pick<Plan, 'nom' | 'description' | 'prixMensuel' | 'prixAnnuel' | 'quotas' | 'fonctionnalites' | 'misEnAvant' | 'statut'>

/** `GET /api/demandes/:id` : la demande et sa frise. */
export type DemandeDetaillee = Demande & { historique: EvenementDemande[] }

/** Événement de la frise d'une demande (reçue, consultée, décision). */
export interface EvenementDemande {
  id: Identifiant
  titre: string
  date: DateISO
  /** Complément après la date (« par Richy · plan Essentiel »). */
  detail?: string
  ton: TonEvenement
}

/** Corps de `POST /api/demandes/:id/refus`. */
export interface RefusDemande {
  motif: string
  precisions?: string
}

/** Corps de `POST /api/demandes/:id/approbation`. */
export interface ApprobationDemande {
  planId: Identifiant
  comptesGestionnaires: number
  debutAbonnement: DateISO
  noteInterne?: string
  messagePersonnalise?: string
}

/** Ligne de la liste des associations (SaAssociations). */
export type AssociationListe = Association & {
  planNom: string
  /** Dernière activité (date ISO ou libellé relatif de la maquette). */
  derniereActivite: DateISO
}

/** Corps de `POST /api/associations` (création directe). */
export interface NouvelleAssociationPlateforme {
  association: { nom: string, type: TypeAssociation, numeroEnregistrement?: string, ville: string, pays: string, description?: string }
  gestionnaire: { prenom: string, nom: string, email: string, telephone: string }
  abonnement: { planId: Identifiant, debut: DateISO, comptesGestionnaires: number, essaiJours: number | null }
  envoyerIdentifiants: boolean
}

/** `GET /api/associations` côté plateforme. */
export interface ListeAssociations {
  associations: AssociationListe[]
  compteurs: CompteursAssociations
}

/** Compteurs des puces de SaAssociations (illustratifs : 147 au total). */
export interface CompteursAssociations {
  toutes: number
  active: number
  impayee: number
  suspendue: number
  onboarding: number
}

/** `GET /api/associations/:id/fiche` (SaAssociation). */
export interface FicheAssociationPlateforme {
  association: Association
  plan: Plan
  contact: { nom: string, initiales: string, role: string, email: string, telephone: string }
  kpi: { projetsActifs: number, souscripteurs: number, collecteCumule: ChiffreOuPlaceholder, tauxRecouvrement: number | '[N]' | null }
  abonnement: { prixMensuel: MontantFCFA | '[PRIX]', prochaineEcheance: DateISO }
  quotas: { projets: QuotaUtilise, souscripteurs: QuotaUtilise, gestionnaires: QuotaUtilise }
  evenements: EvenementPlateforme[]
  projets: { id: Identifiant, nom: string, statut: StatutProjet | null, souscripteurs: string, collecte: string, creeLe: string }[]
  souscripteurs: { id: Identifiant, nom: string, telephone: string, projets: string, statut: StatutSouscription | null }[]
  factures: { id: Identifiant, periode: string, montant: MontantFCFA | '[PRIX]', statut: StatutFacture }[]
  /** Abonnement impayé : date de l'impayé et de la suspension prévue. */
  impaye?: { depuis: DateISO, suspensionLe: DateISO }
  suspendueLe?: DateISO
}

export interface QuotaUtilise {
  utilise: number
  limite: Quota
  /** Largeur de la barre (%) : calculée si la limite est connue, sinon celle de la maquette. */
  pourcentage: number
}

/** Corps de `POST /api/associations/:id/suspension`. */
export interface SuspensionAssociation {
  motif: string
}

```

### projet.ts

```ts
export interface Projet {
  id: Identifiant
  associationId: Identifiant
  nom: string
  description?: string
  imageCouvertureUrl?: string
  /** Nom du fichier de couverture (« couverture_centre.jpg »). V0 : pas d'image réelle, le bandeau garde son motif. */
  imageCouvertureNom?: string
  statut: StatutProjet

  // Financement
  fondsEntree: MontantFCFA | null // null = pas de fonds d'entrée (interrupteur désactivé)
  montantEcheance: MontantFCFA
  frequence: Frequence
  jourEcheance?: number // ex. 5 = « le 5 du mois »

  // Calendrier
  typeCalendrier: TypeCalendrier
  dateDebut: DateISO
  dateFin?: DateISO // dates fixes uniquement
  nbEcheances?: number // dates fixes : calculé (ex. 18)
  delaiGraceJours: number // délai avant passage « en retard »

  /** null = « sans limite ». Tontine : 30 requis. */
  souscripteursRequis: number | null
  modalitesPaiement: ModalitePaiement[]
  instructionsPaiement?: string
  contratModele: string // texte avec variables {nom_souscripteur}, {montant}, {frequence}, {date_debut}

  // Indicateurs (calculés côté back, dénormalisés pour les listes et tableaux de bord).
  // Les placeholders de la maquette (`[N]`, `[MONTANT]`) sont conservés tels quels (Voyage solidaire).
  nbSouscripteurs: number | '[N]'
  montantCollecte: MontantFCFA | '[MONTANT]'
  montantAttenduADate: MontantFCFA | '[MONTANT]'
  tauxRecouvrement: number | '[N]' // en % entier (82)
  /** Part de l'engagement total déjà collectée, en % (barre des cartes projet : 37 %). */
  avancement: number | '[N]'
  nbEnRetard: number
  nbSignaturesAttendues: number
  nbPaiementsAValider: number
  prochaineEcheance?: DateISO
  /** Engagement total par souscripteur (dates fixes) : fonds d'entrée + n × échéance. */
  engagementParSouscripteur?: MontantFCFA
  /** Premiers souscripteurs montrés en pile d'avatars sur la carte gestionnaire (ton = situation). */
  apercuSouscripteurs?: { nom: string, ton?: 'brand' | 'danger' | 'warning' | 'success' }[]
  /** Contrat : signataire pour l'association (étape 5 de la création). */
  signataire?: { nom: string, fonction: string }
  creeLe?: DateISO
}

/** Contrôle segmenté de l'étape 3 : « Dates fixes » / « Cycle roulant ». */
export type TypeCalendrier = 'dates_fixes' | 'cycle_roulant'

/** Badges : Brouillon · Inscriptions ouvertes · En cours · Terminé. */
export type StatutProjet = 'brouillon' | 'inscriptions_ouvertes' | 'en_cours' | 'termine'

```

### session.ts

```ts
/**
 * Réponse de `POST /api/session/connexion` :
 * - `connecte` : session ouverte ;
 * - `premiere-connexion` : mot de passe provisoire, à remplacer (souscripteur) ;
 * - `code-requis` : second facteur à saisir (plateforme).
 */
export type ResultatConnexion
  = | { etape: 'connecte', role: Role }
    | { etape: 'premiere-connexion', role: Role, prenom: string }
    | { etape: 'code-requis', role: Role }

/** Utilisateur de la session courante (`/api/session/moi`). */
export interface UtilisateurSession {
  id: Identifiant
  role: Role
  prenom: string
  nom?: string
  /** Libellé sous le nom (« Souscripteur », « Trésorière »). */
  fonction?: string
  /** Gestionnaire : association courante (carte en tête de la barre latérale). */
  associationId?: Identifiant
  association?: { id: Identifiant, nom: string, sigle?: string, plan: string }
}

/** Compteurs des menus (`/api/navigation/compteurs`). */
export interface CompteursNavigation {
  paiementsAValider: number
  notificationsNonLues: number
  /** Gestionnaire : souscripteurs en retard, tous projets (entrée « Relances » du menu Plus). */
  souscripteursEnRetard: number
  demandesATraiter: number
}

/** Réponse de `POST /api/mot-de-passe/code`. */
export interface EnvoiCode {
  /** Destination affichée (« +225 05 44 21 87 90 » ou l'email). */
  destination: string
  /** Délai avant de pouvoir renvoyer un code, en secondes. */
  delaiRenvoi: number
}

```

### souscripteur.ts

```ts
/** Vue annuaire (MgSouscripteurs) : statut global = le pire de ses projets. */
export interface SouscripteurAnnuaire extends Souscripteur {
  projetIds: Identifiant[]
  totalVerse: MontantFCFA | '[MONTANT]'
  totalReste: MontantFCFA | '[MONTANT]'
  statutGlobal: StatutSouscription
}

/** Situation d'un souscripteur sur un projet. Badges : Signature attendue · À jour · En retard. */
export type StatutSouscription = 'signature_attendue' | 'a_jour' | 'en_retard'

export interface Souscripteur {
  id: Identifiant
  prenom: string
  nom: string
  telephone: string // `+225 07 08 09 10 11`
  email?: string
  adresse?: string
  avatarUrl?: string
  /** Associations dont il est membre (Moussa Diarra : 2). */
  associationIds: Identifiant[]
  membreDepuis: DateISO
}

/** Inscription d'un souscripteur à un projet (ligne de l'onglet Souscripteurs, carte de la fiche). */
export interface Souscription {
  id: Identifiant
  souscripteurId: Identifiant
  projetId: Identifiant
  inscritLe: DateISO
  contratId?: Identifiant
  contratSigneLe?: DateISO // absent = « en attente »
  verse: MontantFCFA
  reste: MontantFCFA
  engagement: MontantFCFA // total dû sur le projet
  statut: StatutSouscription
  /** Montant à régulariser (retards). Ex. Moussa / Centre : 50 000 F. */
  montantEnRetard: MontantFCFA
  /** Retiré du projet par le gestionnaire (historique conservé, plus d'échéances à venir). */
  retireLe?: DateISO
}

```
