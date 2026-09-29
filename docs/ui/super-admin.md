# Espace super-admin

12 écrans. Fiches issues de la spécification UI, complétées par les endpoints, le lot où chaque écran devient réel et les écarts dus au choix « sans fournisseur ».

Données fictives : `docs/specs/seed-reference.yaml`. Statuts et couleurs : `docs/specs/status-mapping.yaml`. Charte : couleur d'espace et couleurs fonctionnelles décrites dans `frontend/CLAUDE.md`.

| Écran | Route | Réel au lot |
|---|---|---|
| [Tableau de bord plateforme](#sa-dashboard) | `/plateforme` | 1.4 |
| [Liste des demandes](#sa-demandes) | `/plateforme/demandes` | 1.3 |
| [Traitement d'une demande](#sa-demande-detail) | `/plateforme/demandes/:id` | 1.3 |
| [Liste des associations](#sa-associations) | `/plateforme/associations` | 1.4 |
| [Détail d'une association](#sa-association-detail) | `/plateforme/associations/:id` | 2.3 |
| [Création directe d'association](#sa-association-new) | `/plateforme/associations/nouvelle` | 1.3 |
| [Plans d'abonnement](#sa-plans) | `/plateforme/plans` | 1.2 |
| [Édition d'un plan](#sa-plan-edit) | `/plateforme/plans/:id` | 1.2 |
| [Facturation globale](#sa-facturation) | `/plateforme/facturation` | 4.6 |
| [Utilisateurs plateforme](#sa-users) | `/plateforme/utilisateurs` | 4.7 |
| [Profil super-admin](#sa-profil) | `/plateforme/profil` | 3.1 |
| [Demandes de réinitialisation (gestionnaires)](#sa-resets) | `/plateforme/reinitialisations` | 1.4 |

<a id="sa-dashboard"></a>

## Tableau de bord plateforme · `sa-dashboard`

Route `/plateforme` · version spec V1 · statut maquette : maquetté · réel au lot **1.4**

**Objectif.** Savoir en un regard ce qui demande une action (demandes à traiter, impayés) et si la plateforme est en bonne santé.

**Zones**

- **En-tête**
  - H1 « Bonjour Richy »
  - Date du jour en sous-titre
  - Bouton primaire « Créer une association »
- **File prioritaire** — composants : Carte, liste, bouton petit
  - Carte large en tête, bordure gauche orange, titre « 4 demandes à traiter »
  - Liste des 3 plus anciennes : nom de l'association, ville, date de la demande (« il y a 2 jours »), plan souhaité, bouton « Examiner »
  - Lien « Voir toutes les demandes »
  - Si vide : état positif « Aucune demande en attente »
- **KPI** — composants : 4 cartes KPI
  - Associations actives (+ variation du mois)
  - Souscripteurs sur la plateforme
  - Revenu mensuel récurrent
  - Abonnements impayés (rouge si > 0)
- **Graphiques** — composants : Visualisation de données
  - Évolution du nombre d'associations actives sur 12 mois (courbe)
  - Répartition des associations par plan (barres horizontales)
- **Associations à surveiller** — composants : Tableau standard
  - Tableau court : associations impayées, inactives depuis 30 jours, ou proches de leurs quotas
  - Colonnes : association, signal (badge), depuis, action
- **Activité récente** — composants : Frise
  - Frise des 10 derniers événements : nouvelle association, suspension, changement de plan

**Interactions**

- Clic sur KPI : liste filtrée
- Clic sur une demande : écran de traitement

**États à gérer** : Nominal, Aucune demande, Première utilisation (plateforme vide), Chargement

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pf.dashboard` | `GET /platform/dashboard` | 1.4 |

<a id="sa-demandes"></a>

## Liste des demandes · `sa-demandes`

Route `/plateforme/demandes` · version spec V1 · statut maquette : maquetté · réel au lot **1.3**

**Objectif.** Traiter les demandes dans l'ordre et retrouver les anciennes.

**Zones**

- **En-tête**
  - H1 « Demandes de création »
- **Filtres** — composants : Onglets, recherche, puces
  - Onglets : À traiter (compteur) · Approuvées · Refusées · Toutes
  - Recherche par nom ou email
  - Filtre par pays, par plan souhaité
- **Tableau** — composants : Tableau standard, badges
  - Colonnes : association (nom + type), responsable (nom + email), ville, souscripteurs estimés, plan souhaité, reçue le, statut
  - Tri par défaut : plus ancienne en premier dans « À traiter »
  - Ligne cliquable

**États à gérer** : Nominal, Vide, Recherche sans résultat

**Mobile.** Liste de cartes : nom, date, plan, badge.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pf.req.list` | `GET /platform/association-requests` | 1.3 |

<a id="sa-demande-detail"></a>

## Traitement d'une demande · `sa-demande-detail`

Route `/plateforme/demandes/:id` · version spec V1 · statut maquette : maquetté · réel au lot **1.3**

**Objectif.** Décider d'approuver ou refuser une association, et lancer sa mise en place.

**Zones**

- **En-tête**
  - Fil d'Ariane, nom de l'association en H1, badge de statut
  - Date de réception et référence
- **Colonne principale** — composants : Cartes, frise
  - Carte « L'association » : type, ville, pays, numéro d'enregistrement, description complète
  - Carte « Le responsable » : nom, fonction, email (copiable), téléphone (copiable)
  - Carte « Besoins exprimés » : souscripteurs estimés, projets envisagés, plan souhaité, source d'acquisition
  - Carte « Historique » : frise (reçue, consultée, décision)
- **Colonne latérale — Décision (collante)** — composants : Carte collante, sélecteur, compteur, boutons
  - Sélecteur du plan à attribuer (pré-rempli avec le souhait)
  - Nombre de comptes gestionnaires autorisés (compteur, défaut selon plan)
  - Date de début d'abonnement
  - Note interne (non visible par l'association)
  - Bouton succès pleine largeur « Approuver et créer l'espace »
  - Bouton danger contour « Refuser »

**Interactions**

- Approuver : modale récapitulative (« L'association Entraide Yopougon sera créée avec le plan Essentiel. Awa Koné recevra ses identifiants par email. ») puis confirmation
- Refuser : modale avec motif obligatoire (liste de motifs + texte libre) et aperçu de l'email envoyé
- Après décision : colonne latérale remplacée par le résumé de la décision

**États à gérer** : À traiter, Approuvée (avec lien vers l'association créée), Refusée (avec motif), Modale d'approbation, Modale de refus

**Mobile.** Colonne de décision déplacée en bas, boutons en barre fixe au bas de l'écran.

**Note.** Le mix automatique / manuel à l'approbation est encore à trancher. La maquette suppose : création automatique de l'espace et du compte, envoi manuel optionnel d'un message personnalisé.

> **Écart avec la maquette (prime sur elle)**
> - Maquette : Email de bienvenue envoyé automatiquement à l'approbation
>   Implémentation : Après approbation : carte « Accès du gestionnaire » avec identifiant, code d'activation et message prêt (Copier, WhatsApp, lien mailto qui ouvre la messagerie du super-admin).

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pf.req.get` | `GET /platform/association-requests/{id}` | 1.3 |
| `pf.req.approve` | `POST /platform/association-requests/{id}/approve` | 1.3 |
| `pf.req.reject` | `POST /platform/association-requests/{id}/reject` | 1.3 |
| `pf.plans` | `GET /platform/plans` | 1.2 |

<a id="sa-associations"></a>

## Liste des associations · `sa-associations`

Route `/plateforme/associations` · version spec V1 · statut maquette : maquetté · réel au lot **1.4**

**Objectif.** Trouver une association et voir d'un coup d'œil son état.

**Zones**

- **En-tête**
  - H1 « Associations », compteur total
  - Bouton « Créer une association », bouton secondaire « Exporter »
- **Filtres**
  - Puces : Toutes · Actives · Impayées · Suspendues · Onboarding
  - Filtre plan, filtre pays, recherche
- **Vue** — composants : Tableau, carte association
  - Contrôle segmenté Tableau / Cartes
  - Tableau : association (logo + nom + ville), plan, statut, projets, souscripteurs, dernière activité, date d'entrée
  - Cartes : carte association version super-admin

**Interactions**

- Ligne : ouvre le détail
- Menu ⋯ : voir, changer de plan, suspendre

**États à gérer** : Nominal, Filtres actifs, Vide

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pf.asso.list` | `GET /platform/associations` | 1.4 |

<a id="sa-association-detail"></a>

## Détail d'une association · `sa-association-detail`

Route `/plateforme/associations/:id` · version spec V1 (onglets usage et facturation en V2) · statut maquette : maquetté · réel au lot **2.3**, complet au lot 4.6

**Objectif.** Comprendre la situation complète d'un client et agir dessus.

**Zones**

- **En-tête**
  - Logo carré, nom H1, ville, badge de statut
  - Actions : « Se connecter en tant que » (V3, désactivé), menu ⋯ (changer de plan, suspendre, réactiver)
- **Onglets** — composants : Onglets
  - Vue d'ensemble · Projets · Souscripteurs · Abonnement · Usage · Paramètres
- **Vue d'ensemble** — composants : KPI, barres de progression
  - KPI : projets actifs, souscripteurs, montant collecté cumulé, taux de recouvrement
  - Carte « Contact principal »
  - Carte « Abonnement » : plan, prix, prochaine échéance, quotas utilisés en barres (projets 3/5, souscripteurs 142/200, gestionnaires 2/3)
  - Frise des événements du compte
- **Projets**
  - Tableau lecture seule : nom, statut, souscripteurs, collecté, créé le
- **Souscripteurs**
  - Tableau lecture seule : nom, téléphone, projets, statut
- **Abonnement**
  - Historique de facturation : période, montant, statut, facture PDF
  - Bouton « Changer de plan »
- **Usage**
  - Connexions des 30 derniers jours (barres)
  - Paiements traités par mois
  - Délai moyen de validation des paiements
- **Paramètres**
  - Nombre de comptes gestionnaires autorisés (surcharge du plan)
  - Zone de danger : suspendre l'association (bouton rouge, confirmation renforcée)

**Interactions**

- Suspendre : modale renforcée avec saisie du nom de l'association et motif

**États à gérer** : Active, Impayée (bandeau orange), Suspendue (bandeau rouge + bouton Réactiver)

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pf.asso.get` | `GET /platform/associations/{id}` | 1.4 |
| `pf.asso.sub` | `GET /platform/associations/{id}/projects`<br>`GET /platform/associations/{id}/members` | 2.3 |
| `pf.asso.usage` | `GET /platform/associations/{id}/usage` | 4.6 |
| `pf.asso.patch` | `PATCH /platform/associations/{id}` | 1.4 |
| `pf.asso.suspend` | `POST /platform/associations/{id}/suspend`<br>`POST /platform/associations/{id}/reactivate` | 1.4 |
| `pf.asso.plan` | `POST /platform/associations/{id}/change-plan` | 1.4 |
| `pf.invoices` | `GET /platform/invoices` | 4.6 |

<a id="sa-association-new"></a>

## Création directe d'association · `sa-association-new`

Route `/plateforme/associations/nouvelle` · version spec V1 · statut maquette : maquetté · réel au lot **1.3**

**Objectif.** Créer une association sans passer par une demande (client accompagné, démonstration).

**Zones**

- **Formulaire en une page, sections repliables** — composants : Sections, champs, interrupteurs
  - Section « Association » : mêmes champs que le formulaire public
  - Section « Gestionnaire principal » : prénom, nom, email, téléphone
  - Section « Abonnement » : plan, date de début, comptes gestionnaires autorisés, période d'essai (interrupteur + durée)
  - Section « Envoi » : interrupteur « Envoyer les identifiants maintenant »
  - Barre d'actions collante en bas : Annuler · Créer l'association

**Interactions**

- Création : toast de succès et redirection vers le détail

**États à gérer** : Vide, Erreurs, Envoi en cours

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pf.asso.create` | `POST /platform/associations` | 1.3 |
| `pf.plans` | `GET /platform/plans` | 1.2 |

<a id="sa-plans"></a>

## Plans d'abonnement · `sa-plans`

Route `/plateforme/plans` · version spec V1 · statut maquette : maquetté · réel au lot **1.2**

**Objectif.** Voir et gérer l'offre commerciale.

**Zones**

- **En-tête**
  - H1 « Plans d'abonnement », bouton « Nouveau plan »
- **Grille de cartes** — composants : Carte tarif
  - Une carte par plan : nom, prix mensuel et annuel, quotas (projets, souscripteurs, gestionnaires), nombre d'associations abonnées, badge Actif / Archivé
  - Plan mis en avant sur la landing signalé par une étoile
  - Menu ⋯ : modifier, dupliquer, archiver

**Interactions**

- Archiver un plan utilisé : message indiquant que les abonnés actuels le conservent

**États à gérer** : Nominal, Aucun plan

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pf.plans` | `GET /platform/plans` | 1.2 |
| `pf.plan.archive` | `POST /platform/plans/{id}/archive`<br>`POST /platform/plans/{id}/duplicate` | 1.2 |

<a id="sa-plan-edit"></a>

## Édition d'un plan · `sa-plan-edit`

Route `/plateforme/plans/:id` · version spec V1 · statut maquette : maquetté · réel au lot **1.2**

**Objectif.** Créer ou modifier une formule tarifaire.

**Zones**

- **Formulaire (gauche)** — composants : Champs, compteurs, interrupteurs
  - Nom, description courte
  - Prix mensuel, prix annuel (calcul automatique de la remise affichée)
  - Quotas : projets actifs, souscripteurs, comptes gestionnaires (compteurs, case « illimité »)
  - Fonctionnalités incluses (cases : import Excel, relances automatiques, rapports avancés, signature électronique)
  - Mise en avant sur la landing (interrupteur)
  - Actif (interrupteur)
- **Aperçu (droite)** — composants : Carte tarif
  - Rendu en direct de la carte tarif telle qu'affichée sur la landing

**Interactions**

- Modification d'un plan ayant des abonnés : avertissement sur l'impact

**États à gérer** : Création, Modification, Avertissement abonnés

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pf.plan.write` | `POST /platform/plans`<br>`PATCH /platform/plans/{id}` | 1.2 |

<a id="sa-facturation"></a>

## Facturation globale · `sa-facturation`

Route `/plateforme/facturation` · version spec V2 · statut maquette : maquetté · réel au lot **4.6**

**Objectif.** Suivre les encaissements d'abonnements et les impayés.

**Zones**

- **KPI** — composants : KPI
  - Revenu du mois, encaissé, en attente, impayé
- **Tableau des factures** — composants : Tableau
  - Onglets : À venir · En attente · Payées · Impayées
  - Colonnes : n° facture, association, période, montant, émise le, échéance, statut, PDF
  - Actions groupées : relancer, exporter

**Interactions**

- Marquer comme payée : modale avec date et référence

**États à gérer** : Nominal, Bientôt disponible (V1)

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pf.invoices` | `GET /platform/invoices` | 4.6 |
| `pf.invoice.paid` | `POST /platform/invoices/{id}/mark-paid` | 4.6 |

<a id="sa-users"></a>

## Utilisateurs plateforme · `sa-users`

Route `/plateforme/utilisateurs` · version spec V2 · statut maquette : maquetté · réel au lot **4.7**

**Objectif.** Gérer l'équipe interne et tracer les actions sensibles.

**Zones**

- **Onglet Équipe** — composants : Tableau
  - Tableau : nom, email, rôle (Propriétaire, Administrateur, Support), dernière connexion, statut
  - Bouton « Inviter un membre »
- **Onglet Journal d'audit** — composants : Tableau, filtres
  - Liste chronologique filtrable : acteur, action, cible, date, adresse IP
  - Filtres par acteur, type d'action, période

**États à gérer** : Nominal, Bientôt disponible (V1)

> **Écart avec la maquette (prime sur elle)**
> - Maquette : Invitation du personnel par email
>   Implémentation : Invitation par lien d'activation à usage unique affiché une fois, à transmettre soi-même.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pf.staff` | `GET /platform/staff`<br>`POST /platform/staff/invitations`<br>`PATCH /platform/staff/{uid}`<br>`DELETE /platform/staff/{uid}` | 4.7 |
| `pf.audit` | `GET /platform/audit-logs` | 4.7 |

<a id="sa-profil"></a>

## Profil super-admin · `sa-profil`

Route `/plateforme/profil` · version spec V1 · statut maquette : maquetté · réel au lot **3.1**, complet au lot 4.7

**Objectif.** Gérer son compte.

**Zones**

- **Sections**
  - Informations personnelles
  - Mot de passe
  - Double authentification (V2)
  - Préférences de notification

**États à gérer** : Nominal

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me.profile` | `GET /me/profile`<br>`PATCH /me/profile`<br>`PUT /me/password` | 3.1 |
| `auth.mfa` | `POST /auth/mfa/verify`<br>`POST /me/mfa/totp`<br>`POST /me/mfa/totp/confirm` | 4.7 |

<a id="sa-resets"></a>

## Demandes de réinitialisation (gestionnaires) · `sa-resets`

Route `/plateforme/reinitialisations` · version spec — · statut maquette : à maquetter · réel au lot **1.4**

**Contenu.** Idem pour les gestionnaires, traité par le super-admin.

_Écran ajouté après les maquettes : à maquetter au démarrage du lot._

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pf.resets` | `GET /platform/password-reset-requests`<br>`POST /platform/password-reset-requests/{id}/issue-code` | 1.4 |
