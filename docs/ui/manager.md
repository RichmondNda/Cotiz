# Espace gestionnaire

28 écrans. Fiches issues de la spécification UI, complétées par les endpoints, le lot où chaque écran devient réel et les écarts dus au choix « sans fournisseur ».

Données fictives : `docs/specs/seed-reference.yaml`. Statuts et couleurs : `docs/specs/status-mapping.yaml`. Charte : couleur d'espace et couleurs fonctionnelles décrites dans `frontend/CLAUDE.md`.

| Écran | Route | Réel au lot |
|---|---|---|
| [Onboarding association](#mg-onboarding) | `/asso/bienvenue` | 2.1 |
| [Tableau de bord gestionnaire](#mg-dashboard) | `/asso` | 2.6 |
| [Liste des projets](#mg-projets) | `/asso/projets` | 2.2 |
| [Création de projet](#mg-projet-new) | `/asso/projets/nouveau` | 2.2 |
| [Détail projet — Vue d'ensemble](#mg-projet-overview) | `/asso/projets/:id` | 2.2 |
| [Détail projet — Souscripteurs](#mg-projet-souscripteurs) | `/asso/projets/:id/souscripteurs` | 2.3 |
| [Détail projet — Paiements](#mg-projet-paiements) | `/asso/projets/:id/paiements` | 2.4 |
| [Détail projet — Contrat](#mg-projet-contrat) | `/asso/projets/:id/contrat` | 4.1 |
| [Détail projet — Paramètres](#mg-projet-params) | `/asso/projets/:id/parametres` | 2.2 |
| [Détail projet — Rapports](#mg-projet-rapports) | `/asso/projets/:id/rapports` | 2.6 |
| [Ajout manuel d'un souscripteur](#mg-add-souscripteur) | `modale depuis un projet` | 2.3 |
| [Import Excel](#mg-import) | `/asso/projets/:id/import` | 4.4 |
| [File de validation des paiements](#mg-paiements-queue) | `/asso/paiements` | 2.4 |
| [Détail d'un paiement déclaré](#mg-paiement-detail) | `/asso/paiements/:id (ou panneau)` | 2.4 |
| [Annuaire des souscripteurs](#mg-annuaire) | `/asso/souscripteurs` | 2.3 |
| [Fiche souscripteur](#mg-fiche) | `/asso/souscripteurs/:id` | 2.3 |
| [Relances](#mg-relances) | `/asso/relances` | 4.3 |
| [Contrats](#mg-contrats) | `/asso/contrats` | 4.1 |
| [Comptes gestionnaires](#mg-equipe) | `/asso/equipe` | 4.5 |
| [Abonnement](#mg-abonnement) | `/asso/abonnement` | 2.1 |
| [Paramètres de l'association](#mg-params) | `/asso/parametres` | 2.1 |
| [Notifications gestionnaire](#mg-notifs) | `/asso/notifications + panneau depuis la cloche` | 4.2 |
| [Profil gestionnaire](#mg-profil) | `/asso/profil` | 3.1 |
| [Codes à remettre](#mg-codes) | `/asso/souscripteurs/codes` | 2.3 |
| [Demandes de réinitialisation](#mg-resets) | `/asso/souscripteurs/reinitialisations` | 3.1 |
| [Relances — onglet « À relancer »](#mg-a-relancer) | `/asso/relances?onglet=a-relancer` | 4.3 |
| [Rapprochement de relevés](#mg-rapprochement) | `/asso/rapprochement` | 5.1 |
| [API et webhooks](#mg-developpeurs) | `/asso/parametres/developpeurs` | 5.2 |

<a id="mg-onboarding"></a>

## Onboarding association · `mg-onboarding`

Route `/asso/bienvenue` · version spec V1 · statut maquette : maquetté · réel au lot **2.1**

**Objectif.** Amener un gestionnaire qui vient de recevoir ses accès à un espace configuré et à son premier projet, sans se perdre.

**Zones**

- **Plein écran, sans barre latérale** — composants : Stepper
  - Logo en haut, barre de progression en 4 étapes, lien « Terminer plus tard »
- **Étape 1 — Bienvenue**
  - Illustration, titre « Bienvenue sur Cotiz, Awa ! »
  - Texte : « En 3 minutes, configurons l'espace d'Entraide Yopougon. »
  - Bouton « Commencer »
- **Étape 2 — Votre association** — composants : Dépôt de fichier, champs
  - Logo (dépôt d'image, recadrage carré)
  - Nom (pré-rempli), description courte, ville, téléphone et email de contact
- **Étape 3 — Comment vos membres vous paient** — composants : Cases, champs conditionnels, aperçu
  - Modalités de paiement par défaut : liste de moyens avec cases (virement bancaire, mobile money, espèces)
  - Pour chaque moyen coché : champs dédiés (IBAN / numéro mobile money + opérateur / instructions)
  - Aperçu de ce que verra le souscripteur
- **Étape 4 — C'est prêt** — composants : Cartes de choix
  - Récapitulatif
  - Deux cartes de choix : « Créer mon premier projet » (primaire) et « Découvrir l'espace d'abord »

**Interactions**

- Chaque étape est enregistrée à la validation
- « Terminer plus tard » : accès au tableau de bord avec un bandeau « Configuration incomplète »

**États à gérer** : Chaque étape, Logo déposé, Moyens de paiement multiples

**Mobile.** Une étape par écran, bouton « Continuer » fixe en bas.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `as.get` | `GET /associations/{aid}` | 2.1 |
| `as.patch` | `PATCH /associations/{aid}` | 2.1 |
| `as.pm` | `GET /associations/{aid}/payment-methods`<br>`PUT /associations/{aid}/payment-methods` | 2.1 |
| `as.onb` | `POST /associations/{aid}/onboarding/complete` | 2.1 |
| `as.upload` | `POST /associations/{aid}/uploads`<br>`POST /associations/{aid}/uploads/{id}/complete` | 2.1 |
| `as.file` | `GET /associations/{aid}/files/{id}` | 2.1 |

<a id="mg-dashboard"></a>

## Tableau de bord gestionnaire · `mg-dashboard`

Route `/asso` · version spec V1 · statut maquette : maquetté · réel au lot **2.6**

**Objectif.** Répondre à « Qu'est-ce que je dois faire aujourd'hui ? » puis « Comment se portent mes projets ? ».

**Zones**

- **En-tête**
  - H1 « Bonjour Awa »
  - Sous-titre : nom de l'association et date
  - Bouton primaire « Créer un projet »
- **À faire (conditionnel)** — composants : Bandeaux d'alerte
  - Bandeau orange si des paiements attendent : « 6 paiements à valider » + bouton « Traiter »
  - Bandeau si des contrats restent non signés depuis plus de 7 jours
  - Masqué si rien à faire, remplacé par un message vert « Tout est à jour »
- **KPI** — composants : 4 cartes KPI
  - Collecté ce mois (vs attendu du mois)
  - Paiements à valider (+ ancienneté du plus ancien)
  - Souscripteurs en retard (sur total actifs)
  - Taux de recouvrement global
- **Mes projets** — composants : Carte projet gestionnaire
  - Titre de section + lien « Tous les projets »
  - Grille de cartes projet (3 par ligne), triées par nombre de retards
  - Carte fantôme « + Nouveau projet » en fin de grille
- **Deux colonnes basses** — composants : Barres groupées, liste compacte
  - Gauche : graphique de collecte mensuelle attendu vs reçu, tous projets, 6 mois
  - Droite : « Derniers paiements déclarés » — 5 lignes : avatar, nom, projet, montant, ancienneté, bouton « Voir »

**Interactions**

- KPI cliquables vers les listes filtrées
- Carte projet : détail du projet

**États à gérer** : Nominal, Premier usage (aucun projet : grand état vide avec bouton de création), Tout est à jour, Chargement

**Mobile.** KPI en défilement horizontal, projets en liste verticale, graphique sous les projets.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `as.dashboard` | `GET /associations/{aid}/dashboard` | 2.6 |
| `mb.codes` | `GET /associations/{aid}/activation-codes`<br>`POST /associations/{aid}/activation-codes/{codeId}/handed` | 2.3 |
| `lg.pay.list` | `GET /associations/{aid}/payments` | 2.4 |

<a id="mg-projets"></a>

## Liste des projets · `mg-projets`

Route `/asso/projets` · version spec V1 · statut maquette : maquetté · réel au lot **2.2**

**Objectif.** Accéder à un projet et comparer leur état.

**Zones**

- **En-tête**
  - H1 « Projets », bouton « Créer un projet »
- **Barre d'outils** — composants : Puces, segmenté
  - Puces : Tous · En cours · Inscriptions ouvertes · Brouillons · Terminés
  - Recherche
  - Contrôle segmenté Cartes / Tableau
- **Vue cartes** — composants : Carte projet
  - Grille de cartes projet gestionnaire
- **Vue tableau** — composants : Tableau standard
  - Colonnes : projet, statut, fréquence, montant par échéance, souscripteurs (inscrits/requis), collecté, taux de recouvrement, prochaine échéance
  - Tri sur chaque colonne

**Interactions**

- Menu ⋯ : ouvrir, dupliquer, archiver

**États à gérer** : Nominal, Vide, Filtre sans résultat

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pr.list` | `GET /associations/{aid}/projects` | 2.2 |
| `pr.lifecycle` | `POST /associations/{aid}/projects/{pid}/publish`<br>`POST /associations/{aid}/projects/{pid}/close`<br>`POST /associations/{aid}/projects/{pid}/duplicate` | 2.2 |

<a id="mg-projet-new"></a>

## Création de projet · `mg-projet-new`

Route `/asso/projets/nouveau` · version spec V1 · statut maquette : maquetté · réel au lot **2.2**

**Objectif.** Configurer un projet complet sans erreur, en comprenant l'impact de chaque paramètre sur l'échéancier.

**Zones**

- **Mise en page** — composants : Stepper
  - Stepper horizontal en haut (6 étapes)
  - Formulaire à gauche (60 %), aperçu collant à droite (40 %)
  - Barre d'actions fixe en bas : « Enregistrer le brouillon » (fantôme), « Retour », « Continuer »
- **Étape 1 — Informations** — composants : Champs, compteur
  - Nom du projet
  - Description (éditeur de texte simple : gras, listes)
  - Image de couverture (optionnelle)
  - Nombre de souscripteurs requis (compteur, case « sans limite »)
- **Étape 2 — Financement** — composants : Champ montant, sélecteur
  - Fonds d'entrée : interrupteur + montant
  - Montant par échéance
  - Fréquence : hebdomadaire, mensuelle, trimestrielle, semestrielle, annuelle
  - Jour d'échéance (ex. le 5 du mois)
- **Étape 3 — Calendrier** — composants : Segmenté, dates
  - Contrôle segmenté : Dates fixes / Cycle roulant
  - Dates fixes : date de début, date de fin → calcul affiché « 18 échéances »
  - Cycle roulant : date de début + explication « Les échéances se génèrent en continu jusqu'à clôture »
  - Délai de grâce avant passage « en retard » (jours)
- **Étape 4 — Modalités de paiement**
  - Reprise des moyens par défaut de l'association, modifiables pour ce projet
  - Instructions spécifiques (ex. « Indiquez votre nom en référence »)
- **Étape 5 — Contrat** — composants : Éditeur, bandeau info
  - Éditeur du texte du contrat, avec modèle pré-rempli et variables insérables : {nom_souscripteur}, {montant}, {frequence}, {date_debut}
  - Nom et fonction du signataire pour l'association
  - Case « Je signe ce contrat au nom de l'association »
  - Avertissement info : « Le contrat ne pourra plus être modifié après création du projet »
- **Étape 6 — Récapitulatif**
  - Toutes les informations groupées par étape, avec lien « Modifier » par bloc
  - Aperçu de l'échéancier complet (tableau des 12 premières échéances)
  - Total attendu par souscripteur
  - Bouton final « Créer le projet »
- **Aperçu collant (droite)** — composants : Carte projet souscripteur
  - Carte projet telle que la verra le souscripteur, mise à jour en direct
  - Sous la carte : mini-échéancier « Entrée 50 000 F · puis 25 000 F / mois × 18 · Total 500 000 F »

**Interactions**

- Validation par étape
- Quitter avec modifications non enregistrées : modale de confirmation
- Création : écran de succès « Projet créé ! » avec deux actions : « Ajouter des souscripteurs » / « Voir le projet »

**États à gérer** : Chaque étape, Dates fixes vs cycle roulant, Récapitulatif, Succès

**Mobile.** Aperçu remplacé par un bouton « Aperçu » ouvrant une feuille basse.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pr.create` | `POST /associations/{aid}/projects` | 2.2 |
| `pr.preview` | `POST /associations/{aid}/projects/schedule-preview` | 2.2 |
| `as.pm` | `GET /associations/{aid}/payment-methods`<br>`PUT /associations/{aid}/payment-methods` | 2.1 |
| `fl.upload` | `POST /uploads`<br>`POST /uploads/{id}/complete` | 0.5 |

<a id="mg-projet-overview"></a>

## Détail projet — Vue d'ensemble · `mg-projet-overview`

Route `/asso/projets/:id` · version spec V1 · statut maquette : maquetté · réel au lot **2.2**, complet au lot 4.3

**Objectif.** Savoir immédiatement si le projet se porte bien et ce qui cloche.

**Zones**

- **En-tête de projet (commun à tous les onglets)** — composants : Onglets avec compteurs
  - Fil d'Ariane
  - Image de couverture en bandeau fin (120 px) si présente
  - Nom H1, badge de statut, ligne « Mensuel · 25 000 F · 52 souscripteurs · depuis mars 2026 »
  - Actions : « Ajouter un souscripteur » (primaire), menu ⋯ (dupliquer, clôturer, exporter)
  - Onglets : Vue d'ensemble · Souscripteurs (52) · Paiements (6 à valider) · Contrat · Paramètres · Rapports
- **KPI du projet** — composants : KPI, anneau
  - Collecté / attendu à date (barre)
  - Taux de recouvrement (anneau)
  - En retard (nombre + montant cumulé)
  - Prochaine échéance (date + montant attendu total)
- **Alertes** — composants : Bandeaux
  - Liste des points d'attention : souscripteurs en retard de plus de 2 échéances, paiements non validés depuis 5 jours, contrats non signés
- **Graphique** — composants : Barres groupées
  - Collecte par échéance, attendu vs reçu, sur toute la durée
- **Retardataires** — composants : Liste compacte
  - Top 5 : avatar, nom, échéances en retard, montant dû, bouton « Relancer »

**États à gérer** : Projet en cours, Inscriptions ouvertes (KPI de remplissage à la place), Projet terminé (bilan final), Aucun retard

**Mobile.** Onglets en défilement horizontal.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pr.get` | `GET /associations/{aid}/projects/{pid}` | 2.2 |
| `pr.overview` | `GET /associations/{aid}/projects/{pid}/overview` | 2.2 |
| `rm.send` | `POST /associations/{aid}/reminders` | 4.3 |

<a id="mg-projet-souscripteurs"></a>

## Détail projet — Souscripteurs · `mg-projet-souscripteurs`

Route `/asso/projets/:id/souscripteurs` · version spec V1 (import en V2) · statut maquette : maquetté · réel au lot **2.3**

**Objectif.** Gérer qui participe au projet.

**Zones**

- **Barre d'outils** — composants : Barre d'outils
  - Recherche, puces de statut (Tous · À jour · En retard · Signature attendue · Retirés)
  - Bouton secondaire « Importer (Excel) », bouton primaire « Ajouter un souscripteur »
  - Indicateur de remplissage : « 52 / 60 souscripteurs requis »
- **Tableau** — composants : Tableau standard
  - Colonnes : souscripteur (avatar, nom, date d'inscription), téléphone, contrat (signé le / en attente), versé, reste, statut
  - Sélection multiple : relancer, exporter, retirer
  - Menu ⋯ : voir la fiche, relancer, renvoyer les identifiants, retirer du projet

**Interactions**

- Retirer : modale de confirmation (historique conservé)
- Renvoyer les identifiants : confirmation + toast

**États à gérer** : Nominal, Aucun souscripteur (état vide avec les deux boutons d'ajout), Sélection multiple active

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `en.list` | `GET /associations/{aid}/projects/{pid}/enrollments` | 2.3 |
| `en.withdraw` | `POST /associations/{aid}/enrollments/{eid}/withdraw` | 2.3 |
| `en.bulk` | `POST /associations/{aid}/enrollments/bulk` | 2.3 |
| `mb.resend` | `POST /associations/{aid}/members/{uid}/activation-code` | 2.3 |
| `mb.codes` | `GET /associations/{aid}/activation-codes`<br>`POST /associations/{aid}/activation-codes/{codeId}/handed` | 2.3 |

<a id="mg-projet-paiements"></a>

## Détail projet — Paiements · `mg-projet-paiements`

Route `/asso/projets/:id/paiements` · version spec V1 · statut maquette : maquetté · réel au lot **2.4**

**Objectif.** Voir en un regard qui a payé quoi, et traiter les paiements en attente.

**Zones**

- **Encart « À valider » (si non vide)** — composants : Cartes compactes
  - Liste horizontale de cartes compactes : avatar, nom, montant, échéances couvertes, ancienneté, bouton « Examiner »
- **Barre d'outils**
  - Recherche, filtre par statut, sélecteur de période
  - Contrôle segmenté : Grille / Liste des paiements
  - Légende des couleurs de cases
- **Vue grille (par défaut)** — composants : Grille d'échéances
  - Grille d'échéances : une ligne par souscripteur, une colonne par échéance, colonne « Reste » à droite
  - Mois courant surligné, défilement positionné dessus
- **Vue liste** — composants : Tableau
  - Tableau de tous les paiements déclarés : date, souscripteur, montant, échéances couvertes, preuve (miniature), statut, validé par

**Interactions**

- Clic sur une case : panneau latéral de l'échéance
- Clic sur « Examiner » : panneau latéral de validation (voir écran Détail d'un paiement)
- Validation depuis le panneau sans quitter la grille : la case passe au vert avec une animation

**États à gérer** : Grille nominale, Grille avec beaucoup de retards, Panneau d'échéance ouvert, Vue liste

**Mobile.** Grille remplacée par une liste de cartes souscripteur avec leur rangée de cases.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `lg.grid` | `GET /associations/{aid}/projects/{pid}/grid` | 2.4 |
| `lg.inst` | `GET /associations/{aid}/installments/{iid}` | 2.4 |
| `lg.pay.list` | `GET /associations/{aid}/payments` | 2.4 |
| `lg.pay.validate` | `POST /associations/{aid}/payments/{payId}/validate` | 2.4 |

<a id="mg-projet-contrat"></a>

## Détail projet — Contrat · `mg-projet-contrat`

Route `/asso/projets/:id/contrat` · version spec V2 · statut maquette : maquetté · réel au lot **4.1**, complet au lot 4.3

**Objectif.** Consulter le contrat et suivre les signatures.

**Zones**

- **Bandeau** — composants : Bandeau info
  - Info : « Contrat verrouillé — signé par 48 souscripteurs sur 52 »
- **Colonne gauche**
  - Rendu du contrat en format document, avec signature de l'association en bas
  - Bouton « Télécharger le PDF »
- **Colonne droite** — composants : Liste compacte
  - Suivi des signatures : barre de progression, liste des non-signataires avec bouton « Relancer », lien « Voir tous »

**États à gérer** : Nominal, Tous signés

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `ct.get` | `GET /associations/{aid}/projects/{pid}/contract`<br>`PUT /associations/{aid}/projects/{pid}/contract`<br>`POST /associations/{aid}/projects/{pid}/contract/lock` | 4.1 |
| `fl.get` | `GET /files/{id}` | 0.5 |
| `rm.send` | `POST /associations/{aid}/reminders` | 4.3 |

<a id="mg-projet-params"></a>

## Détail projet — Paramètres · `mg-projet-params`

Route `/asso/projets/:id/parametres` · version spec V1 · statut maquette : maquetté · réel au lot **2.2**

**Objectif.** Consulter et ajuster les paramètres qui peuvent encore l'être.

**Zones**

- **Sections en cartes** — composants : Cartes, champs verrouillés
  - Informations générales (modifiable) : nom, description, image
  - Financement (lecture seule si des paiements existent) : fonds d'entrée, montant, fréquence — cadenas et infobulle « Non modifiable : des paiements ont été enregistrés »
  - Calendrier : dates ou cycle, délai de grâce (modifiable)
  - Modalités de paiement (modifiable)
  - Relances (V2) : lien vers la configuration
- **Zone de danger** — composants : Boutons danger
  - Clôturer le projet
  - Supprimer le projet (uniquement si aucun paiement) — confirmation renforcée

**États à gérer** : Nominal, Champs verrouillés

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pr.get` | `GET /associations/{aid}/projects/{pid}` | 2.2 |
| `pr.patch` | `PATCH /associations/{aid}/projects/{pid}` | 2.2 |
| `pr.lifecycle` | `POST /associations/{aid}/projects/{pid}/publish`<br>`POST /associations/{aid}/projects/{pid}/close`<br>`POST /associations/{aid}/projects/{pid}/duplicate` | 2.2 |
| `pr.delete` | `DELETE /associations/{aid}/projects/{pid}` | 2.2 |

<a id="mg-projet-rapports"></a>

## Détail projet — Rapports · `mg-projet-rapports`

Route `/asso/projets/:id/rapports` · version spec V1 simple, V2 avancé · statut maquette : maquetté · réel au lot **2.6**, complet au lot 5.2

**Objectif.** Produire une vue d'ensemble partageable avec le bureau de l'association.

**Zones**

- **Barre d'outils**
  - Sélecteur de période
  - Boutons « Exporter CSV », « Exporter PDF » (V2)
- **Synthèse** — composants : KPI
  - Total attendu, total reçu, reste à percevoir, taux de recouvrement
- **Graphiques** — composants : Visualisation
  - Collecte par échéance (barres)
  - Évolution du taux de recouvrement (courbe)
  - Répartition des souscripteurs par statut (anneau segmenté)
- **Tableau récapitulatif** — composants : Tableau
  - Par souscripteur : attendu, versé, reste, nombre de retards, dernier paiement

**États à gérer** : Nominal, Bientôt disponible pour les graphiques avancés

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `rp.report` | `GET /associations/{aid}/projects/{pid}/report` | 2.6 |
| `rp.export` | `POST /associations/{aid}/exports`<br>`GET /associations/{aid}/exports/{id}` | 4.6 |
| `rp.analytics` | `GET /associations/{aid}/analytics` | 5.2 |

<a id="mg-add-souscripteur"></a>

## Ajout manuel d'un souscripteur · `mg-add-souscripteur`

Route `modale depuis un projet` · version spec V1 · statut maquette : maquetté · réel au lot **2.3**

**Objectif.** Inscrire quelqu'un en 30 secondes sans créer de doublon.

**Zones**

- **Étape 1 — Téléphone** — composants : Champ téléphone
  - Champ téléphone seul, mis en avant, avec explication « Nous vérifions si cette personne a déjà un compte Cotiz »
  - Bouton « Continuer »
- **Cas A — Compte existant** — composants : Carte identité
  - Carte d'identité trouvée : avatar, nom, nombre d'associations (sans détail, confidentialité)
  - Texte « Cette personne a déjà un compte. Elle sera rattachée à votre projet et recevra une invitation. »
  - Bouton « Rattacher au projet »
- **Cas B — Nouveau** — composants : Champs, segmenté
  - Prénom, nom, email (optionnel), adresse (optionnelle)
  - Canal d'envoi des identifiants : SMS / email
  - Date d'entrée dans le projet (défaut : aujourd'hui) et échéances à rattraper (cases)
  - Bouton « Créer et inscrire »
- **Cas C — Déjà inscrit**
  - Message info : « Cette personne participe déjà à ce projet »

**Interactions**

- Succès : toast + ligne ajoutée en haut du tableau avec surbrillance
- Option « Ajouter un autre » pour enchaîner

**États à gérer** : Étape téléphone, Compte existant, Nouveau compte, Déjà inscrit

**Mobile.** Modale plein écran depuis le bas.

> **Écart avec la maquette (prime sur elle)**
> - Maquette : Envoi des identifiants : SMS / email
>   Implémentation : Après l'ajout : carte « Code d'activation » avec le code, sa date d'expiration et les boutons Copier, WhatsApp, SMS (ouvre l'application du téléphone), Imprimer.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `mb.lookup` | `POST /associations/{aid}/members/lookup` | 2.3 |
| `en.create` | `POST /associations/{aid}/projects/{pid}/enrollments` | 2.3 |

<a id="mg-import"></a>

## Import Excel · `mg-import`

Route `/asso/projets/:id/import` · version spec V2 · statut maquette : maquetté · réel au lot **4.4**

**Objectif.** Inscrire des dizaines de personnes d'un coup, en corrigeant les erreurs avant validation.

**Zones**

- **Stepper 4 étapes** — composants : Stepper
  - Fichier · Colonnes · Vérification · Envoi
- **Étape 1 — Fichier** — composants : Zone de dépôt
  - Zone de dépôt grand format (.xlsx, .csv)
  - Lien « Télécharger le modèle Excel »
  - Aide : colonnes attendues
- **Étape 2 — Correspondance des colonnes** — composants : Tableau, sélecteurs
  - Pour chaque colonne du fichier : son nom, 3 valeurs d'exemple, un sélecteur vers le champ Cotiz (prénom, nom, téléphone, email, adresse, ignorer)
  - Correspondance automatique pré-remplie quand les noms concordent
- **Étape 3 — Vérification** — composants : KPI, tableau éditable
  - Résumé en KPI : 47 lignes prêtes (vert), 3 comptes existants rattachés (bleu), 2 erreurs (rouge), 1 doublon dans le fichier (orange)
  - Tableau filtrable par ces catégories, cellules en erreur surlignées en rouge et éditables directement
  - Actions par ligne erreur : corriger, ignorer
- **Étape 4 — Envoi** — composants : Aperçu message
  - Canal des invitations : SMS / email / les deux
  - Aperçu du message
  - Bouton « Importer 50 souscripteurs »
  - Écran de progression puis bilan

**États à gérer** : Chaque étape, Fichier invalide, Beaucoup d'erreurs, Import terminé

**Mobile.** Déconseillé sur mobile : message invitant à utiliser un ordinateur.

> **Écart avec la maquette (prime sur elle)**
> - Maquette : Canal des invitations : SMS / email / les deux
>   Implémentation : Option supprimée tant que le groupe 6 n'est pas activé ; à la fin de l'import, lien vers « Codes à remettre » et fiche imprimable groupée.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `fl.upload` | `POST /uploads`<br>`POST /uploads/{id}/complete` | 0.5 |
| `im.flow` | `POST /associations/{aid}/projects/{pid}/imports` | 4.4 |
| `im.steps` | `PATCH /associations/{aid}/imports/{id}/mapping`<br>`PATCH /associations/{aid}/imports/{id}/rows/{rowId}` | 4.4 |
| `im.read` | `GET /associations/{aid}/imports/{id}`<br>`GET /associations/{aid}/imports/{id}/rows` | 4.4 |
| `im.commit` | `POST /associations/{aid}/imports/{id}/commit` | 4.4 |

<a id="mg-paiements-queue"></a>

## File de validation des paiements · `mg-paiements-queue`

Route `/asso/paiements` · version spec V1 · statut maquette : maquetté · réel au lot **2.4**

**Objectif.** Traiter tous les paiements déclarés, tous projets confondus, le plus vite possible.

**Zones**

- **En-tête** — composants : Onglets
  - H1 « Paiements à valider », compteur
  - Onglets : À valider · Validés · Rejetés · Tous
- **Mise en page maître-détail (desktop)** — composants : Liste, panneau
  - Gauche (40 %) : liste des paiements, le plus ancien en haut. Chaque élément : avatar, nom, projet, montant, ancienneté (rouge au-delà de 5 jours)
  - Droite (60 %) : détail du paiement sélectionné (voir écran suivant), navigation clavier ↑ ↓
- **Filtres**
  - Par projet, par ancienneté, par montant

**Interactions**

- Après validation ou rejet : passage automatique au paiement suivant
- Raccourcis clavier : V valider, R rejeter, ↓ suivant

**États à gérer** : File pleine, File vide (état positif), Validés

**Mobile.** Liste seule, le détail s'ouvre en plein écran.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `lg.pay.list` | `GET /associations/{aid}/payments` | 2.4 |

<a id="mg-paiement-detail"></a>

## Détail d'un paiement déclaré · `mg-paiement-detail`

Route `/asso/paiements/:id (ou panneau)` · version spec V1 · statut maquette : maquetté · réel au lot **2.4**

**Objectif.** Vérifier la preuve et valider en confiance, avec la bonne répartition.

**Zones**

- **En-tête**
  - Avatar, nom du souscripteur (lien fiche), projet
  - Montant déclaré en très grand (32 px)
  - Date de déclaration, moyen de paiement indiqué, badge « En attente »
- **Preuve** — composants : Visionneuse de preuve
  - Visionneuse : image en grand avec zoom, ou PDF, ou référence de transaction copiable
  - Rappel pour le gestionnaire : « Vérifiez sur votre relevé un virement de 75 000 F vers le 10 septembre »
- **Répartition** — composants : Sélecteur d'échéances
  - Liste des échéances couvertes telle que proposée par le souscripteur
  - Bouton « Ajuster » : même composant que le sélecteur d'échéances, éditable par le gestionnaire
  - Total réparti / montant
- **Contexte** — composants : Grille (1 ligne), frise
  - Situation du souscripteur sur ce projet : mini-rangée de cases d'échéances, reste à payer
  - Ses 3 derniers paiements
- **Actions (pied collant)** — composants : Boutons succès et danger
  - « Rejeter » (danger contour) → modale : motif (liste : preuve illisible, montant non reçu, montant différent, autre) + message au souscripteur
  - « Valider le paiement » (succès) → confirmation légère intégrée, puis toast avec « Annuler » pendant 10 s
  - Montant reçu différent : lien « Le montant reçu est différent » ouvrant un champ pour saisir le montant réel

**États à gérer** : Image, PDF, Référence seule, Répartition ajustée, Modale de rejet, Validé

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `lg.pay.get` | `GET /associations/{aid}/payments/{payId}` | 2.4 |
| `fl.get` | `GET /files/{id}` | 0.5 |
| `lg.pay.validate` | `POST /associations/{aid}/payments/{payId}/validate` | 2.4 |
| `lg.pay.reject` | `POST /associations/{aid}/payments/{payId}/reject` | 2.4 |
| `lg.pay.revert` | `POST /associations/{aid}/payments/{payId}/revert-validation` | 2.4 |

<a id="mg-annuaire"></a>

## Annuaire des souscripteurs · `mg-annuaire`

Route `/asso/souscripteurs` · version spec V1 · statut maquette : maquetté · réel au lot **2.3**, complet au lot 4.6

**Objectif.** Retrouver n'importe quel membre de l'association, tous projets confondus.

**Zones**

- **Barre d'outils**
  - Recherche nom / téléphone, filtre par projet, filtre par statut global
  - Export
- **Tableau** — composants : Tableau, badges
  - Colonnes : souscripteur, téléphone, email, projets (pastilles avec nom court), total versé, total restant, statut global (le pire de ses projets)

**États à gérer** : Nominal, Vide

**Mobile.** Liste de cartes.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `mb.list` | `GET /associations/{aid}/members` | 2.3 |
| `rp.export` | `POST /associations/{aid}/exports`<br>`GET /associations/{aid}/exports/{id}` | 4.6 |

<a id="mg-fiche"></a>

## Fiche souscripteur · `mg-fiche`

Route `/asso/souscripteurs/:id` · version spec V1 · statut maquette : maquetté · réel au lot **2.3**, complet au lot 4.3

**Objectif.** Tout savoir sur un membre avant de l'appeler.

**Zones**

- **Colonne gauche — identité** — composants : Carte, boutons
  - Grand avatar, nom, téléphone (bouton appeler, copier), email, adresse, membre depuis
  - Actions : Envoyer une relance, Renvoyer les identifiants, Modifier
- **Colonne droite** — composants : Onglets, grille, frise
  - Onglets : Projets · Historique · Contrats
  - Projets : pour chaque projet une carte avec la rangée de cases d'échéances, versé, reste, statut
  - Historique : frise complète (paiements, validations, relances, signatures)
  - Contrats : liste avec date de signature et PDF

**États à gérer** : À jour, En retard, Contrat non signé

**Mobile.** Identité en haut, onglets en dessous.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `mb.get` | `GET /associations/{aid}/members/{uid}` | 2.3 |
| `mb.patch` | `PATCH /associations/{aid}/members/{uid}` | 2.3 |
| `mb.timeline` | `GET /associations/{aid}/members/{uid}/timeline` | 2.3 |
| `mb.resend` | `POST /associations/{aid}/members/{uid}/activation-code` | 2.3 |
| `rm.send` | `POST /associations/{aid}/reminders` | 4.3 |
| `mb.codes` | `GET /associations/{aid}/activation-codes`<br>`POST /associations/{aid}/activation-codes/{codeId}/handed` | 2.3 |

<a id="mg-relances"></a>

## Relances · `mg-relances`

Route `/asso/relances` · version spec V2 · statut maquette : maquetté · réel au lot **4.3**

**Objectif.** Automatiser les rappels et relancer ponctuellement.

**Zones**

- **Onglet Automatiques** — composants : Cartes, interrupteurs
  - Liste de règles sous forme de cartes : « 3 jours avant l'échéance · SMS », « Le jour de l'échéance · SMS + email », « 7 jours après · SMS »
  - Chaque règle : interrupteur actif, canal, modèle, projets concernés
  - Bouton « Nouvelle règle »
- **Éditeur de règle** — composants : Aperçu mobile
  - Déclencheur (avant / le jour / après, nombre de jours)
  - Canal
  - Message avec variables insérables et compteur de caractères SMS (160)
  - Aperçu téléphone
- **Onglet Manuelle**
  - Sélection des destinataires : tous les retardataires d'un projet, sélection libre
  - Message, canal, bouton « Envoyer »
- **Onglet Historique** — composants : Tableau
  - Tableau : date, destinataire, canal, message, statut d'envoi (envoyé, échoué)

**États à gérer** : Nominal, Bientôt disponible (V1)

> **Écart avec la maquette (prime sur elle)**
> - Maquette : Règles « 3 jours avant · SMS », « Le jour J · SMS + email », compteur de caractères SMS (160)
>   Implémentation : Canaux proposés : Dans l'application, Notification push. SMS et email n'apparaissent que si la fonctionnalité est activée (features). Le compteur de 160 caractères reste utile pour le message prêt à copier.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `rm.rules` | `GET /associations/{aid}/reminder-rules`<br>`POST /associations/{aid}/reminder-rules`<br>`PATCH /associations/{aid}/reminder-rules/{id}` | 4.3 |
| `rm.send` | `POST /associations/{aid}/reminders` | 4.3 |
| `rm.hist` | `GET /associations/{aid}/reminders/history` | 4.3 |
| `rm.queue` | `GET /associations/{aid}/reminders/queue`<br>`POST /associations/{aid}/reminders/queue/{id}/handled` | 4.3 |

<a id="mg-contrats"></a>

## Contrats · `mg-contrats`

Route `/asso/contrats` · version spec V2 · statut maquette : maquetté · réel au lot **4.1**

**Objectif.** Voir l'état des signatures sur tous les projets.

**Zones**

- **Tableau par projet** — composants : Tableau, barres
  - Projet, date de création du contrat, signés / total (barre), non signés depuis plus de 7 jours, actions (voir, relancer les non-signataires)

**États à gérer** : Nominal, Bientôt disponible (V1)

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `ct.list` | `GET /associations/{aid}/contracts` | 4.1 |

<a id="mg-equipe"></a>

## Comptes gestionnaires · `mg-equipe`

Route `/asso/equipe` · version spec V2 · statut maquette : maquetté · réel au lot **4.5**

**Objectif.** Partager la gestion avec d'autres membres du bureau.

**Zones**

- **Indicateur de quota** — composants : Barre
  - « 2 comptes sur 3 autorisés par votre plan »
- **Liste** — composants : Cartes
  - Cartes : avatar, nom, email, rôle (Administrateur principal, Gestionnaire, Lecture seule), dernière connexion
  - Bouton « Inviter » désactivé avec infobulle si quota atteint
- **Invitation** — composants : Modale
  - Modale : email, rôle, message optionnel

**États à gérer** : Nominal, Quota atteint, Bientôt disponible (V1)

> **Écart avec la maquette (prime sur elle)**
> - Maquette : Invitation de gestionnaires par email
>   Implémentation : Invitation par code d'activation affiché avec message prêt, comme pour les souscripteurs.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `tm.team` | `GET /associations/{aid}/team`<br>`POST /associations/{aid}/team/invitations`<br>`PATCH /associations/{aid}/team/{uid}`<br>`DELETE /associations/{aid}/team/{uid}` | 4.5 |

<a id="mg-abonnement"></a>

## Abonnement · `mg-abonnement`

Route `/asso/abonnement` · version spec V1 lecture, V2 factures · statut maquette : maquetté · réel au lot **2.1**, complet au lot 4.6

**Objectif.** Savoir ce que l'association paie et où elle en est de ses quotas.

**Zones**

- **Plan actuel** — composants : Carte
  - Carte : nom du plan, prix, prochaine échéance, bouton « Changer de plan » (contact en V1)
- **Quotas** — composants : Barres
  - Barres : projets, souscripteurs, gestionnaires — orange au-delà de 80 %, rouge à 100 %
- **Factures (V2)** — composants : Tableau
  - Tableau : période, montant, statut, PDF

**États à gérer** : Nominal, Quota proche, Abonnement impayé

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `bl.sub` | `GET /associations/{aid}/subscription` | 2.1 |
| `bl.inv` | `GET /associations/{aid}/invoices` | 4.6 |

<a id="mg-params"></a>

## Paramètres de l'association · `mg-params`

Route `/asso/parametres` · version spec V1 · statut maquette : maquetté · réel au lot **2.1**

**Objectif.** Tenir à jour l'identité et les modalités de paiement.

**Zones**

- **Sections** — composants : Cartes, champs
  - Identité : logo, nom, description, contact
  - Modalités de paiement par défaut
  - Préférences : délai de grâce par défaut, langue

**États à gérer** : Nominal

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `as.get` | `GET /associations/{aid}` | 2.1 |
| `as.patch` | `PATCH /associations/{aid}` | 2.1 |
| `as.pm` | `GET /associations/{aid}/payment-methods`<br>`PUT /associations/{aid}/payment-methods` | 2.1 |
| `as.upload` | `POST /associations/{aid}/uploads`<br>`POST /associations/{aid}/uploads/{id}/complete` | 2.1 |
| `as.file` | `GET /associations/{aid}/files/{id}` | 2.1 |

<a id="mg-notifs"></a>

## Notifications gestionnaire · `mg-notifs`

Route `/asso/notifications + panneau depuis la cloche` · version spec V2 · statut maquette : maquetté · réel au lot **4.2**

**Objectif.** Ne rien rater.

**Zones**

- **Panneau déroulant depuis la cloche** — composants : Élément de notification
  - 380 px, 8 dernières notifications, bouton « Tout marquer comme lu », lien « Voir tout »
- **Page complète**
  - Filtres par type : Paiements · Signatures · Système
  - Groupement par période
- **Types**
  - Nouveau paiement déclaré
  - Contrat signé par un souscripteur
  - Souscripteur passé en retard
  - Quota bientôt atteint
  - Facture d'abonnement disponible

**États à gérer** : Avec non lues, Vide

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `nt.list` | `GET /me/notifications`<br>`GET /me/notifications/unread-count` | 2.5 |
| `nt.read` | `POST /me/notifications/{id}/read`<br>`POST /me/notifications/read-all` | 2.5 |
| `nt.stream` | `GET /me/notifications/stream` | 4.2 |

<a id="mg-profil"></a>

## Profil gestionnaire · `mg-profil`

Route `/asso/profil` · version spec V1 · statut maquette : maquetté · réel au lot **3.1**, complet au lot 4.2

**Objectif.** Gérer son compte personnel.

**Zones**

- **Sections**
  - Informations personnelles
  - Mot de passe
  - Préférences de notification (email pour chaque type d'événement)

**États à gérer** : Nominal

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me.profile` | `GET /me/profile`<br>`PATCH /me/profile`<br>`PUT /me/password` | 3.1 |
| `me.prefs` | `GET /me/notification-preferences`<br>`PUT /me/notification-preferences` | 4.2 |
| `me.push` | `GET /public/push/vapid-public-key`<br>`POST /me/push-subscriptions`<br>`DELETE /me/push-subscriptions/{id}` | 4.2 |

<a id="mg-codes"></a>

## Codes à remettre · `mg-codes`

Route `/asso/souscripteurs/codes` · version spec — · statut maquette : à maquetter · réel au lot **2.3**

**Contenu.** Liste des comptes non activés : nom, téléphone, code, date d'expiration, boutons Copier / WhatsApp / SMS depuis le téléphone / Imprimer la fiche (avec QR), case « remis ».

_Écran ajouté après les maquettes : à maquetter au démarrage du lot._

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `mb.codes` | `GET /associations/{aid}/activation-codes`<br>`POST /associations/{aid}/activation-codes/{codeId}/handed` | 2.3 |
| `mb.resend` | `POST /associations/{aid}/members/{uid}/activation-code` | 2.3 |

<a id="mg-resets"></a>

## Demandes de réinitialisation · `mg-resets`

Route `/asso/souscripteurs/reinitialisations` · version spec — · statut maquette : à maquetter · réel au lot **3.1**

**Contenu.** Souscripteurs ayant demandé un nouveau mot de passe ; bouton « Générer un code » qui affiche le code une fois avec message prêt.

_Écran ajouté après les maquettes : à maquetter au démarrage du lot._

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `as.resets` | `GET /associations/{aid}/password-reset-requests`<br>`POST /associations/{aid}/password-reset-requests/{id}/issue-code` | 3.1 |

<a id="mg-a-relancer"></a>

## Relances — onglet « À relancer » · `mg-a-relancer`

Route `/asso/relances?onglet=a-relancer` · version spec — · statut maquette : à maquetter · réel au lot **4.3**

**Contenu.** File quotidienne des retardataires avec message prêt, marquage relancé / ignoré. S'ajoute aux trois onglets existants.

_Écran ajouté après les maquettes : à maquetter au démarrage du lot._

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `rm.queue` | `GET /associations/{aid}/reminders/queue`<br>`POST /associations/{aid}/reminders/queue/{id}/handled` | 4.3 |

<a id="mg-rapprochement"></a>

## Rapprochement de relevés · `mg-rapprochement`

Route `/asso/rapprochement` · version spec — · statut maquette : à maquetter · réel au lot **5.1**

**Contenu.** Relevé importé à gauche, déclarations à droite, propositions avec score, confirmation en lot.

_Écran ajouté après les maquettes : à maquetter au démarrage du lot._

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `bk.statements` | `POST /associations/{aid}/bank-statements`<br>`GET /associations/{aid}/bank-statements`<br>`GET /associations/{aid}/bank-statements/{id}` | 5.1 |
| `bk.match` | `GET /associations/{aid}/bank-statements/{id}/matches`<br>`POST /associations/{aid}/bank-statements/{id}/matches/confirm` | 5.1 |
| `fl.upload` | `POST /uploads`<br>`POST /uploads/{id}/complete` | 0.5 |

<a id="mg-developpeurs"></a>

## API et webhooks · `mg-developpeurs`

Route `/asso/parametres/developpeurs` · version spec — · statut maquette : à maquetter · réel au lot **5.2**

**Contenu.** Clés d'API et webhooks sortants.

_Écran ajouté après les maquettes : à maquetter au démarrage du lot._

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `dev.keys` | `GET /associations/{aid}/api-keys`<br>`POST /associations/{aid}/api-keys`<br>`DELETE /associations/{aid}/api-keys/{id}` | 5.2 |
| `dev.webhooks` | `GET /associations/{aid}/webhooks`<br>`POST /associations/{aid}/webhooks`<br>`PATCH /associations/{aid}/webhooks/{id}`<br>`GET /associations/{aid}/webhooks/{id}/deliveries` | 5.2 |
