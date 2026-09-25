# Lot 02 — Espace public

> À lancer dans une session Claude Code neuve (`/clear`), à la racine du repo, avec `/lot 02` ou en collant ce fichier.
> Règles : `CLAUDE.md`. Références : `design/INVENTAIRE.md`, `design/DONNEES-REFERENCE.md`.

## Objectif

Implémente les 8 écrans de l'espace public avec les layouts `public` (landing, demande, légal) et `auth` (connexions,
mot de passe) créés au lot 01.

## Précision 
Le dossier de travail du frontend est le dossier frontend c'est dans celui là qu'il faut travailler pour la partie front

## Écrans

| Écran | Route | États (web / mobile) | Captures |
|---|---|---|---|
| Main | `/` | défaut | `design/screens/public/*/Main__*.png` |
| Demande | `/demande` | navigable, etape1-vide, etape2-erreurs, etape3-plan, envoi-en-cours | `design/screens/public/*/Demande__*.png` |
| Confirmation | `/demande/confirmation` | défaut | `design/screens/public/*/Confirmation__*.png` |
| Connexion | `/connexion` | nominal, numero-inconnu, mot-de-passe-incorrect, premiere-connexion | `design/screens/public/*/Connexion__*.png` |
| ConnexionAssociation | `/connexion/association` | nominal, identifiants-incorrects, compte-suspendu, blocage-15-min, chargement | `design/screens/public/*/ConnexionAssociation__*.png` |
| ConnexionPlateforme | `/connexion/plateforme` | nominal, erreur, code-verification | `design/screens/public/*/ConnexionPlateforme__*.png` |
| MotDePasse | `/mot-de-passe` | navigable, code-incorrect, code-expire, nouveau-mot-de-passe, succes | `design/screens/public/*/MotDePasse__*.png` |
| Legal | `/legal/[document]` | cgu, confidentialite, mentions | `design/screens/public/*/Legal__*.png` |

## Points d'attention

- Landing : ancres avec défilement doux, menu « Se connecter » qui ouvre le choix du profil (souscripteur → `/connexion`,
  gestionnaire → `/connexion/association`, plateforme → `/connexion/plateforme`), en-tête qui change au défilement.
  Les cartes de tarif pré-sélectionnent le plan dans `/demande` (query `?plan=`). Mobile : menu hamburger, tarifs en
  carrousel horizontal (plan mis en avant en premier).
- Demande : formulaire en 3 étapes avec validation par étape (état `etape2-erreurs`), récapitulatif, état d'envoi,
  puis redirection vers `/demande/confirmation`. `POST /api/demandes` mocké.
- Connexions : gabarit scindé (panneau illustré 50 % aux couleurs du profil + formulaire 400 px) ; sur mobile, formulaire seul
  avec logo au-dessus. Chaque état d'erreur de l'inventaire doit être atteignable avec des identifiants mockés documentés
  (ex. un numéro inconnu, un mot de passe faux, un compte suspendu). Succès → pose `cotiz_role` et redirige :
  souscripteur `/accueil` (ou `/bienvenue` si première connexion), gestionnaire `/asso`, super-admin `/plateforme`
  (après l'étape `code-verification`). Ces pages cibles peuvent encore être des coquilles vides à ce stade.
- Mot de passe : parcours code SMS → nouveau mot de passe → succès, avec les états code incorrect / expiré.
- Légal : une seule page dynamique `/legal/[document]` (`cgu`, `confidentialite`, `mentions`), sommaire + contenu.

## Fin de lot

- Chaque état de chaque écran vérifié avec `/verifier-ecran` (web et mobile).
- `/revue-lot 02`, corrections, typecheck + lint.
- Compte rendu : écarts assumés, placeholders restants, questions. Commit : `feat(public): lot 02 — espace public`.
