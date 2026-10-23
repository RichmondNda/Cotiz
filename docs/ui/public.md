# Espace public

8 écrans. Fiches issues de la spécification UI, complétées par les endpoints, le lot où chaque écran devient réel et les écarts dus au choix « sans fournisseur ».

Données fictives : `docs/specs/seed-reference.yaml`. Statuts et couleurs : `docs/specs/status-mapping.yaml`. Charte : couleur d'espace et couleurs fonctionnelles décrites dans `frontend/CLAUDE.md`.

| Écran | Route | Réel au lot |
|---|---|---|
| [Landing page](#pub-landing) | `/` | 1.2 |
| [Formulaire de demande de création](#pub-demande) | `/demande` | 1.3 |
| [Confirmation de demande](#pub-confirm) | `/demande/confirmation` | — |
| [Connexion gestionnaire](#pub-login-mg) | `/connexion/association` | 1.3 |
| [Connexion souscripteur](#pub-login-mb) | `/connexion` | 3.1 |
| [Connexion plateforme](#pub-login-sa) | `/connexion/plateforme` | 1.1 |
| [Mot de passe oublié](#pub-reset) | `/mot-de-passe` | 1.1 |
| [Pages légales](#pub-legal) | `/legal/cgu · /legal/confidentialite · /legal/mentions` | 1.3 |

<a id="pub-landing"></a>

## Landing page · `pub-landing`

Route `/` · version spec — · statut maquette : maquetté · réel au lot **1.2**

**Objectif.** Convaincre en 30 secondes un responsable d'association que Cotiz va lui faire gagner du temps et de la sérénité sur le suivi des cotisations, puis l'amener à faire une demande.

**Zones**

- **En-tête fixe** — composants : Boutons primaire et secondaire, menu contextuel
  - Logo Cotiz à gauche
  - Liens d'ancre : Fonctionnement, Tarifs, FAQ
  - « Se connecter » (bouton secondaire) ouvrant un menu : Je suis gestionnaire / Je suis souscripteur
  - « Créer mon association » (bouton primaire)
  - Au défilement : fond blanc + ombre légère
- **Héros** — composants : Bouton grand, visuel produit
  - Titre H1 44 px : « Les cotisations de votre association, enfin sous contrôle »
  - Sous-titre : « Projets, échéances, paiements, relances : tout au même endroit. Vos membres savent ce qu'ils doivent, vous savez qui a payé. »
  - CTA primaire grand « Créer mon association » + lien « Voir comment ça marche ↓ »
  - À droite : maquette du tableau de bord gestionnaire inclinée, avec une carte souscripteur mobile superposée en premier plan
  - Ligne de réassurance sous les CTA : « Sans engagement · Mise en place en 48 h · Données hébergées en sécurité »
- **Problème** — composants : Cartes simples icône + titre + texte
  - 3 cartes illustrant la situation actuelle : « Le cahier qui se perd », « Les relances par WhatsApp une par une », « Personne ne sait qui a payé quoi »
  - Ton empathique, pas culpabilisant
- **Fonctionnement en 3 étapes** — composants : Stepper horizontal illustré
  - 1. Créez vos projets — montant, fréquence, durée
  - 2. Inscrivez vos membres — un par un ou par fichier Excel
  - 3. Suivez et validez — vos membres déclarent, vous confirmez
  - Chaque étape illustrée d'une capture d'écran réelle du produit
- **Deux publics**
  - Bloc en deux colonnes : « Pour les gestionnaires » (violet) et « Pour vos membres » (corail)
  - Chaque colonne : 4 bénéfices avec icône
  - Rappel visuel des couleurs d'identité des espaces
- **Tarifs** — composants : Carte tarif, badge, bouton
  - 3 cartes de plans côte à côte, celle du milieu mise en avant (badge « Le plus choisi », bordure brand)
  - Chaque carte : nom, prix mensuel en grand, limites (projets, souscripteurs, gestionnaires), liste de fonctionnalités cochées, bouton
  - Mention sous les cartes : « Besoin de plus ? Contactez-nous »
- **Témoignages**
  - 2 ou 3 citations de responsables d'associations avec avatar, nom, rôle, association
- **FAQ** — composants : Accordéon
  - Accordéon de 6 à 8 questions : L'argent passe-t-il par Cotiz ? Mes membres doivent-ils installer une application ? Que se passe-t-il si un membre est dans plusieurs associations ? Mes données sont-elles sécurisées ?
- **Appel final**
  - Bandeau pleine largeur fond violet : « Prêt à organiser votre association ? » + bouton blanc
- **Pied de page**
  - 4 colonnes : Produit, Ressources, Légal, Contact
  - Logo + slogan, réseaux sociaux, copyright

**Interactions**

- Ancres avec défilement doux
- Menu « Se connecter » : redirige vers la page de connexion du profil choisi
- Cartes de tarif : le bouton pré-sélectionne le plan dans le formulaire de demande

**États à gérer** : Desktop 1440, Mobile 390, En-tête après défilement, Menu « Se connecter » ouvert

**Mobile.** Menu hamburger. Héros empilé : texte puis visuel mobile seul. Tarifs en carrousel horizontal, plan mis en avant affiché en premier.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pub.plans` | `GET /public/plans` | 1.2 |

<a id="pub-demande"></a>

## Formulaire de demande de création · `pub-demande`

Route `/demande` · version spec V1 · statut maquette : maquetté · réel au lot **1.3**

**Objectif.** Permettre à une association de se présenter en moins de 5 minutes, sans friction, avec assez d'informations pour que le super-admin puisse décider.

**Zones**

- **En-tête simplifié**
  - Logo + lien retour vers l'accueil
  - Pas de menu de navigation, pour rester concentré
- **Colonne gauche (40 %)**
  - Titre « Créons l'espace de votre association »
  - Rappel des 3 étapes suivantes : demande → validation sous 48 h → réception des accès
  - Encart de réassurance avec icône cadenas
- **Formulaire en 3 étapes (60 %)** — composants : Stepper, champs, carte radio, case à cocher
  - Étape 1 — L'association : nom, type (association, mutuelle, tontine, groupement…), ville, pays, numéro d'enregistrement (optionnel), description de l'activité (zone de texte, 500 caractères, compteur)
  - Étape 2 — Le responsable : prénom, nom, fonction dans l'association, email, téléphone
  - Étape 3 — Vos besoins : nombre estimé de souscripteurs (sélecteur par tranches), nombre de projets envisagés, plan souhaité (cartes radio des plans), comment avez-vous connu Cotiz, case d'acceptation des CGU
  - Boutons « Retour » et « Continuer » en pied, « Envoyer ma demande » à la dernière étape

**Interactions**

- Validation par étape avant de passer à la suivante
- Sauvegarde locale du brouillon si l'utilisateur quitte la page
- Soumission : bouton en chargement puis redirection vers la confirmation

**États à gérer** : Étape 1 vide, Étape 2 avec erreurs, Étape 3 avec plan sélectionné, Envoi en cours

**Mobile.** Colonne gauche masquée, remplacée par une ligne de contexte sous le titre. Stepper compact « Étape 2 sur 3 ».

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pub.plans` | `GET /public/plans` | 1.2 |
| `pub.challenge` | `GET /public/altcha-challenge` | 1.3 |
| `pub.request` | `POST /public/association-requests` | 1.3 |

<a id="pub-confirm"></a>

## Confirmation de demande · `pub-confirm`

Route `/demande/confirmation` · version spec V1 · statut maquette : maquetté

**Objectif.** Rassurer : la demande est bien partie, voici ce qui va se passer.

**Zones**

- **Carte centrale** — composants : État vide positif
  - Grande icône de succès animée (coche dans un cercle vert)
  - Titre « Demande envoyée ! »
  - Texte : « Nous examinons votre demande et revenons vers vous sous 48 h ouvrées à l'adresse awa@entraide.ci »
  - Numéro de référence de la demande en police mono
- **Et maintenant ?** — composants : Frise d'historique
  - Frise verticale en 3 points : Demande reçue (fait) → Vérification par notre équipe → Réception de vos accès
- **Actions**
  - « Retour à l'accueil » (secondaire)

**États à gérer** : Nominal

_Aucun appel d'API (page statique)._

<a id="pub-login-mg"></a>

## Connexion gestionnaire · `pub-login-mg`

Route `/connexion/association` · version spec V1 · statut maquette : maquetté · réel au lot **1.3**, complet au lot 1.1

**Objectif.** Connecter rapidement un gestionnaire à l'espace de son association.

**Zones**

- **Panneau gauche (desktop)**
  - Fond violet #7F77DD avec motif discret de cercles
  - Logo blanc, phrase « Votre association, organisée. »
  - Illustration : aperçu du tableau de bord
- **Formulaire** — composants : Champs, bouton, liens
  - Titre « Espace association »
  - Champ email
  - Champ mot de passe avec bouton afficher/masquer
  - Case « Rester connecté »
  - Bouton primaire violet pleine largeur « Se connecter »
  - Lien « Mot de passe oublié ? »
  - Séparateur puis lien « Vous êtes souscripteur ? Accéder à votre espace »
  - Lien « Pas encore inscrit ? Créer mon association »

**Interactions**

- Erreur d'identifiants : bandeau rouge au-dessus du formulaire, champs conservés
- Après 5 échecs : message de blocage temporaire 15 min
- Première connexion : redirection vers le changement de mot de passe puis l'onboarding

**États à gérer** : Nominal, Identifiants incorrects, Compte suspendu (bandeau rouge avec contact), Chargement

**Mobile.** Panneau gauche masqué, logo violet au-dessus du formulaire.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `auth.login` | `POST /auth/login` | 1.1 |
| `auth.activate` | `POST /auth/activate` | 1.1 |
| `me` | `GET /me` | 1.1 |

<a id="pub-login-mb"></a>

## Connexion souscripteur · `pub-login-mb`

Route `/connexion` · version spec V1 · statut maquette : maquetté · réel au lot **3.1**, complet au lot 1.1

**Objectif.** Permettre à un membre, souvent peu à l'aise avec le numérique, de se connecter avec son numéro de téléphone.

**Zones**

- **Panneau gauche (desktop)**
  - Fond corail #D85A30, logo blanc
  - Phrase « Suivez vos cotisations en toute simplicité »
- **Formulaire** — composants : Champ téléphone, bouton grand
  - Titre « Mon espace »
  - Champ téléphone avec indicatif pays (drapeau, défaut +225), clavier numérique
  - Champ mot de passe avec afficher/masquer
  - Bouton primaire corail grand (50 px) « Me connecter »
  - Lien « Mot de passe oublié ? »
  - Texte d'aide : « Vos identifiants vous ont été envoyés par votre association par SMS ou email »
  - Lien discret « Vous êtes gestionnaire d'une association ? »

**Interactions**

- Première connexion : écran de choix d'un nouveau mot de passe, avec indicateur de robustesse
- Identifiant inconnu : message « Ce numéro n'est rattaché à aucun compte. Contactez votre association. »

**États à gérer** : Nominal, Numéro inconnu, Mot de passe incorrect, Première connexion — nouveau mot de passe

**Mobile.** Écran prioritaire en mobile. Logo en haut, formulaire centré, bouton pleine largeur.

> **Écart avec la maquette (prime sur elle)**
> - Maquette : « Vos identifiants vous ont été envoyés par votre association par SMS ou email »
>   Implémentation : « Votre association vous a remis un code d'activation (en main propre, par WhatsApp ou SMS depuis son téléphone). »

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `auth.login` | `POST /auth/login` | 1.1 |
| `auth.activate` | `POST /auth/activate` | 1.1 |
| `me` | `GET /me` | 1.1 |

<a id="pub-login-sa"></a>

## Connexion plateforme · `pub-login-sa`

Route `/connexion/plateforme` · version spec V1 · statut maquette : maquetté · réel au lot **1.1**, complet au lot 4.7

**Objectif.** Accès sécurisé à l'administration de la plateforme.

**Zones**

- **Formulaire centré** — composants : Champs, bouton
  - Fond indigo #F2F2F8 plein écran, carte blanche centrée 420 px
  - Logo, titre « Administration Cotiz »
  - Email, mot de passe, bouton indigo
  - Étape suivante (V2) : code de vérification à 6 chiffres

**Interactions**

- Page non référencée, aucun lien depuis le site public

**États à gérer** : Nominal, Erreur, Code de vérification (V2)

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `auth.login` | `POST /auth/login` | 1.1 |
| `auth.mfa` | `POST /auth/mfa/verify`<br>`POST /me/mfa/totp`<br>`POST /me/mfa/totp/confirm` | 4.7 |

<a id="pub-reset"></a>

## Mot de passe oublié · `pub-reset`

Route `/mot-de-passe` · version spec V1 · statut maquette : maquetté · réel au lot **1.1**

**Objectif.** Récupérer l'accès sans contacter l'association.

**Zones**

- **Étape 1 — Demande**
  - Champ email (gestionnaire) ou téléphone (souscripteur) selon le profil d'origine
  - Bouton « Recevoir un code »
- **Étape 2 — Code** — composants : Saisie de code
  - 6 cases de saisie de chiffre, passage automatique à la suivante
  - Lien « Renvoyer le code » actif après 60 s avec compte à rebours
- **Étape 3 — Nouveau mot de passe**
  - Nouveau mot de passe + confirmation
  - Indicateur de robustesse en 4 segments (rouge → vert)
  - Règles listées avec coche qui passe au vert quand satisfaite
- **Succès**
  - Message de confirmation et bouton vers la connexion

**États à gérer** : Chaque étape, Code incorrect, Code expiré

> **Écart avec la maquette (prime sur elle)**
> - Maquette : Mot de passe oublié en 3 étapes avec code reçu par SMS ou email
>   Implémentation : Étape 1 : saisir son identifiant → message « Votre demande est transmise à votre association (ou à l'équipe Cotiz pour un gestionnaire). Elle vous remettra un code. » Étapes 2 et 3 inchangées (saisie du code, nouveau mot de passe).

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `auth.forgot` | `POST /auth/password/forgot` | 1.1 |
| `auth.verify` | `POST /auth/password/verify-code` | 1.1 |
| `auth.reset` | `POST /auth/password/reset` | 1.1 |

<a id="pub-legal"></a>

## Pages légales · `pub-legal`

Route `/legal/cgu · /legal/confidentialite · /legal/mentions` · version spec — · statut maquette : maquetté · réel au lot **1.3**

**Objectif.** Présenter les textes juridiques de façon lisible.

**Zones**

- **Mise en page**
  - Colonne de lecture 720 px
  - Sommaire latéral collant à gauche avec les titres de section, section active surlignée
  - Date de dernière mise à jour en haut
  - Bouton « Imprimer » et « Télécharger en PDF »

**États à gérer** : Nominal

**Mobile.** Sommaire replié en haut dans un accordéon.

**Endpoints**

| Id | Opérations | Lot |
|---|---|---|
| `pub.legal` | `GET /public/legal/{slug}` | 1.3 |
