# Espace souscripteur

12 écrans. Fiches issues de la spécification UI, complétées par les endpoints, le lot où chaque écran devient réel et les écarts dus au choix « sans fournisseur ».

Données fictives : `docs/specs/seed-reference.yaml`. Statuts et couleurs : `docs/specs/status-mapping.yaml`. Charte : couleur d'espace et couleurs fonctionnelles décrites dans `frontend/CLAUDE.md`.

| Écran | Route | Réel au lot |
|---|---|---|
| [Onboarding souscripteur](#mb-onboarding) | `/bienvenue` | 3.1 |
| [Tableau de bord souscripteur](#mb-dashboard) | `/accueil` | 3.2 |
| [Détail d'un projet](#mb-projet) | `/projets/:id` | 3.2 |
| [Signature de contrat](#mb-contrat) | `/projets/:id/contrat` | 4.1 |
| [Déclaration de paiement](#mb-declarer) | `/paiements/declarer` | 3.3 |
| [Confirmation de déclaration](#mb-declarer-ok) | `/paiements/declarer/ok` | 3.3 |
| [Historique complet](#mb-historique) | `/historique` | 3.4 |
| [Mes associations](#mb-associations) | `/associations` | 4.5 |
| [Détail d'une association](#mb-association-detail) | `/associations/:id` | 4.5 |
| [Mes contrats](#mb-contrats) | `/contrats` | 4.1 |
| [Notifications](#mb-notifs) | `/notifications` | 4.2 |
| [Profil et paramètres](#mb-profil) | `/profil` | 3.1 |

<a id="mb-onboarding"></a>

## Onboarding souscripteur · `mb-onboarding`

Route `/bienvenue` · version spec V1 · statut maquette : maquetté · réel au lot **3.1**, complet au lot 1.1

**Objectif.** Expliquer en 3 écrans ce qu'est Cotiz à une personne qui ne l'a pas choisi : c'est son association qui l'y a inscrite.

**Zones**

- **Carrousel plein écran (3 diapositives)** — composants : Carrousel, bouton grand
  - 1 — « Bienvenue Moussa ! Entraide Yopougon vous a inscrit sur Cotiz. » Illustration d'une carte projet.
  - 2 — « Voyez ce que vous devez, quand vous le devez. » Illustration du reste à payer.
  - 3 — « Après chaque virement, déclarez-le ici. Votre association confirme la réception. » Illustration du bouton de déclaration.
  - Points de pagination, bouton « Suivant », lien « Passer »
  - Dernière diapositive : bouton « Voir mes projets »

**Interactions**

- Glissement horizontal entre diapositives

**États à gérer** : Chaque diapositive

**Mobile.** Écran conçu d'abord pour mobile. Sur desktop : carte centrée 480 px.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me` | `GET /me` | 1.1 |

<a id="mb-dashboard"></a>

## Tableau de bord souscripteur · `mb-dashboard`

Route `/accueil` (la spec disait `/`, pris par la landing) · version spec V1 · statut maquette : maquetté · réel au lot **3.2**

**Objectif.** Répondre à « Combien je dois, pour quoi, et quand ? » dès l'ouverture.

**Zones**

- **En-tête**
  - « Bonjour Moussa 👋 », cloche avec compteur
- **Synthèse** — composants : Carte synthèse
  - Carte large fond corail plein, texte blanc : « Total restant à payer » en grand (32 px) — 395 000 F
  - Sous le montant : « sur 3 projets · 2 associations »
  - Si retards : ligne blanche sur fond rouge pâle intégrée « 30 000 F en retard — Régulariser »
- **Actions à faire (conditionnel)** — composants : Carte d'action
  - Cartes d'action empilées, une par contrat à signer : « Signez le contrat du projet Voyage solidaire »
- **Prochaine échéance** — composants : Carte
  - Carte : projet, montant, date, compte à rebours « dans 4 jours », bouton « Déclarer un paiement »
- **Mes projets** — composants : Carte projet souscripteur
  - Titre « Mes projets »
  - Cartes projet souscripteur, une par projet, triées : retard, signature, prochaine échéance
- **Derniers mouvements** — composants : Liste compacte
  - 3 dernières lignes : date, projet, montant, badge de statut
  - Lien « Tout l'historique »
- **Bouton flottant** — composants : Bouton flottant
  - Bouton rond corail « + » libellé « Déclarer un paiement », en bas à droite

**Interactions**

- Carte projet : détail du projet
- Bouton flottant : déclaration avec projet à choisir

**États à gérer** : Nominal, En retard, Contrat à signer, Tout est payé (message de félicitations), Aucun projet

**Mobile.** Mise en page native mobile. Desktop : synthèse et prochaine échéance côte à côte, projets en grille de 2.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me.dash` | `GET /me/dashboard` | 3.2 |
| `nt.list` | `GET /me/notifications`<br>`GET /me/notifications/unread-count` | 2.5 |

<a id="mb-projet"></a>

## Détail d'un projet · `mb-projet`

Route `/projets/:id` · version spec V1 · statut maquette : maquetté · réel au lot **3.2**

**Objectif.** Voir précisément où j'en suis sur ce projet et agir.

**Zones**

- **En-tête**
  - Retour, nom du projet, nom de l'association en petit
  - Petit bouton discret « Contrat » (icône document) en haut à droite
- **Carte de situation** — composants : Carte, barre
  - Reste à payer en grand
  - Barre de progression versé / total
  - Trois chiffres : versé · total · échéances restantes
- **Action** — composants : Bouton grand
  - Bouton grand pleine largeur « Déclarer un paiement »
- **Échéancier** — composants : Liste, badges
  - Liste verticale de toutes les échéances : mois, montant, badge de statut
  - Échéances passées repliées au-delà de 3 (« Voir les 8 échéances précédentes »)
  - Échéance courante mise en évidence
  - Paiement partiel : « 10 000 / 25 000 F »
- **Comment payer** — composants : Accordéon, copier
  - Carte repliable : moyens de paiement de l'association avec coordonnées copiables (bouton copier sur l'IBAN ou le numéro mobile money), instructions
- **Mes paiements déclarés**
  - Liste : date, montant, statut (en attente, validé, rejeté avec motif)

**Interactions**

- Paiement rejeté : ligne avec motif et bouton « Déclarer à nouveau »

**États à gérer** : À jour, En retard, Paiement en attente, Paiement rejeté, Projet terminé

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me.project` | `GET /me/projects/{pid}` | 3.2 |
| `fl.get` | `GET /files/{id}` | 0.5 |

<a id="mb-contrat"></a>

## Signature de contrat · `mb-contrat`

Route `/projets/:id/contrat` · version spec V2 · statut maquette : maquetté · réel au lot **4.1**

**Objectif.** Faire lire et accepter le contrat, simplement, avec la certitude de ce qu'on signe.

**Zones**

- **En-tête**
  - « Contrat — Voyage solidaire », association
- **Résumé de l'engagement** — composants : Carte
  - Carte en haut : « Vous vous engagez à verser 50 000 F à l'entrée, puis 10 000 F par mois pendant 12 mois. Total : 170 000 F. »
- **Texte du contrat**
  - Contenu intégral, typographie de lecture (16 px, interligne 1.7)
  - Signature de l'association visible en bas
- **Signature (pied collant)** — composants : Case, bouton grand
  - Case « J'ai lu et j'accepte les termes de ce contrat »
  - Bouton grand « Signer le contrat » désactivé tant que la case n'est pas cochée
  - Mention « Signature électronique horodatée »
- **Après signature**
  - Écran de succès, bouton « Voir mon échéancier », lien « Télécharger le contrat signé »

**États à gérer** : Lecture, Case cochée, Signé, Consultation d'un contrat déjà signé

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me.contract` | `GET /me/projects/{pid}/contract` | 4.1 |
| `me.sign` | `POST /me/projects/{pid}/contract/sign` | 4.1 |
| `fl.get` | `GET /files/{id}` | 0.5 |

<a id="mb-declarer"></a>

## Déclaration de paiement · `mb-declarer`

Route `/paiements/declarer` · version spec V1 · statut maquette : maquetté · réel au lot **3.3**

**Objectif.** Déclarer un virement en moins d'une minute, sans erreur de répartition.

**Zones**

- **Étape 1 — Projet** — composants : Cartes radio
  - Si ouvert depuis un projet : étape sautée
  - Sinon : liste de cartes radio des projets actifs avec reste à payer
- **Étape 2 — Montant** — composants : Champ montant, puces, sélecteur d'échéances
  - Champ montant très grand, centré, clavier numérique
  - Raccourcis en puces : « 1 échéance · 25 000 F », « Tout le retard · 50 000 F », « 3 mois · 75 000 F »
  - Sous le champ : sélecteur d'échéances couvertes, pré-rempli automatiquement
- **Étape 3 — Preuve** — composants : Dépôt, champs
  - Date du paiement (défaut : aujourd'hui)
  - Moyen utilisé (liste des moyens de l'association)
  - Zone de dépôt : sur mobile, deux gros boutons « Prendre une photo » / « Choisir une image »
  - Alternative : champ « Référence de la transaction »
  - Commentaire optionnel
- **Récapitulatif**
  - Projet, montant, échéances couvertes, preuve (miniature)
  - Bouton « Envoyer ma déclaration »

**Interactions**

- Écran de confirmation après envoi

**États à gérer** : Chaque étape, Montant partiel, Montant supérieur au reste (message), Envoi

**Mobile.** Une étape par écran, bouton « Continuer » fixe en bas.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me.projects` | `GET /me/projects` | 3.2 |
| `me.alloc` | `POST /me/payments/allocation-preview` | 3.3 |
| `fl.upload` | `POST /uploads`<br>`POST /uploads/{id}/complete` | 0.5 |
| `me.declare` | `POST /me/payments` | 3.3 |

<a id="mb-declarer-ok"></a>

## Confirmation de déclaration · `mb-declarer-ok`

Route `/paiements/declarer/ok` · version spec V1 · statut maquette : maquetté · réel au lot **3.3**

**Objectif.** Rassurer et expliquer la suite.

**Zones**

- **Contenu**
  - Icône de succès
  - « Déclaration envoyée ! »
  - « Entraide Yopougon va vérifier la réception de vos 75 000 F. Vous serez notifié dès la validation. »
  - Mini-récapitulatif
  - Boutons : « Retour au projet » / « Accueil »

**États à gérer** : Nominal

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me.payment` | `GET /me/payments/{id}` | 3.3 |

<a id="mb-historique"></a>

## Historique complet · `mb-historique`

Route `/historique` · version spec V1 tableau, V2 graphiques · statut maquette : maquetté · réel au lot **3.4**

**Objectif.** Comprendre l'évolution de mes cotisations et retrouver n'importe quel paiement.

**Zones**

- **Filtres** — composants : Puces
  - Puces : association, projet, période (3 mois, 6 mois, 1 an, tout)
  - Filtres appliqués au graphique et au tableau ensemble
- **Graphiques** — composants : Courbe, barres
  - Courbe cumulative du versé, avec objectif en pointillé
  - Barres par mois : versé par projet (couleurs de projet distinctes)
  - Infobulles au toucher
- **Synthèse de la sélection** — composants : KPI
  - Total versé, nombre de paiements, reste
- **Liste chronologique** — composants : Liste
  - Groupée par mois : date, projet, association, montant, statut
  - Clic : détail du paiement avec la preuve envoyée

**États à gérer** : Nominal, Filtre actif, Aucun paiement

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me.history` | `GET /me/history`<br>`GET /me/history/series` | 3.4 |
| `me.payment` | `GET /me/payments/{id}` | 3.3 |

<a id="mb-associations"></a>

## Mes associations · `mb-associations`

Route `/associations` · version spec V2 · statut maquette : maquetté · réel au lot **4.5**

**Objectif.** Voir mes appartenances.

**Zones**

- **Liste** — composants : Carte association
  - Cartes association (version souscripteur) : logo, nom, projets actifs, reste à payer, statut

**États à gérer** : Nominal, Une seule association

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me.assos` | `GET /me/associations`<br>`GET /me/associations/{aid}` | 4.5 |

<a id="mb-association-detail"></a>

## Détail d'une association · `mb-association-detail`

Route `/associations/:id` · version spec V2 · statut maquette : maquetté · réel au lot **4.5**

**Objectif.** Retrouver les informations et les projets d'une association.

**Zones**

- **En-tête**
  - Logo, nom, ville, contacts (appeler, email)
- **Projets** — composants : Carte projet
  - Cartes projet souscripteur de cette association
- **Comment payer**
  - Modalités de paiement de l'association

**États à gérer** : Nominal

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me.assos` | `GET /me/associations`<br>`GET /me/associations/{aid}` | 4.5 |

<a id="mb-contrats"></a>

## Mes contrats · `mb-contrats`

Route `/contrats` · version spec V2 · statut maquette : maquetté · réel au lot **4.1**

**Objectif.** Retrouver ses engagements.

**Zones**

- **Liste** — composants : Liste
  - Pour chaque contrat : projet, association, signé le, bouton télécharger
  - Contrats à signer en tête avec badge orange

**États à gérer** : Nominal, À signer

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me.contracts` | `GET /me/contracts` | 4.1 |
| `fl.get` | `GET /files/{id}` | 0.5 |

<a id="mb-notifs"></a>

## Notifications · `mb-notifs`

Route `/notifications` · version spec V2 · statut maquette : maquetté · réel au lot **4.2**

**Objectif.** Savoir ce qui s'est passé et agir en un geste.

**Zones**

- **Liste** — composants : Élément de notification
  - Groupée : Aujourd'hui · Cette semaine · Plus ancien
  - Types : échéance proche, échéance en retard, paiement validé, paiement rejeté, nouveau projet / contrat à signer
  - Chaque élément ouvre l'écran d'action (relance → déclaration de paiement pré-remplie)
  - « Tout marquer comme lu » en haut

**États à gérer** : Avec non lues, Vide

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `nt.list` | `GET /me/notifications`<br>`GET /me/notifications/unread-count` | 2.5 |
| `nt.read` | `POST /me/notifications/{id}/read`<br>`POST /me/notifications/read-all` | 2.5 |
| `nt.stream` | `GET /me/notifications/stream` | 4.2 |

<a id="mb-profil"></a>

## Profil et paramètres · `mb-profil`

Route `/profil` · version spec V1 · statut maquette : maquetté · réel au lot **3.1**, complet au lot 4.2

**Objectif.** Gérer mes informations et mes préférences.

**Zones**

- **Identité**
  - Avatar, nom, téléphone (non modifiable directement : « Contactez votre association »)
- **Menu en liste** — composants : Liste de menu, interrupteurs
  - Informations personnelles (email, adresse)
  - Mes associations · Mes contrats
  - Notifications : interrupteurs SMS / email par type (V2)
  - Mot de passe
  - Aide
  - Se déconnecter (rouge, en bas)

**États à gérer** : Nominal

> **Écart avec la maquette (prime sur elle)**
> - Maquette : Notifications : interrupteurs SMS / email par type (V2)
>   Implémentation : Interrupteurs « Dans l'application » et « Notifications push » par type ; SMS / email masqués tant que non activés.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `me.profile` | `GET /me/profile`<br>`PATCH /me/profile`<br>`PUT /me/password` | 3.1 |
| `me.prefs` | `GET /me/notification-preferences`<br>`PUT /me/notification-preferences` | 4.2 |
| `me.push` | `GET /public/push/vapid-public-key`<br>`POST /me/push-subscriptions`<br>`DELETE /me/push-subscriptions/{id}` | 4.2 |
