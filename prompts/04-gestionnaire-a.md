# Lot 04 — Gestionnaire A — accueil et projets

> À lancer dans une session Claude Code neuve (`/clear`), à la racine du repo, avec `/lot 04` ou en collant ce fichier.
> Règles : `CLAUDE.md`. Références : `design/INVENTAIRE.md`, `design/DONNEES-REFERENCE.md`.

## Objectif

Implémente l'onboarding, le tableau de bord, la liste des projets et la création de projet (thème `manager`, layout
`backoffice`). Utilisatrice connectée : Awa Koné, Entraide Yopougon.

## Précision 
Le dossier de travail du frontend est le dossier frontend c'est dans celui là qu'il faut travailler pour la partie front

## Écrans

| Écran | Route | États (web / mobile) | Captures |
|---|---|---|---|
| MgOnboarding | `/asso/bienvenue` | 1-bienvenue, 2-association, 3-paiements, 4-pret | `design/screens/gestionnaire/*/MgOnboarding__*.png` |
| MgDashboard | `/asso` | nominal, premier-usage | `design/screens/gestionnaire/*/MgDashboard__*.png` |
| MgProjets | `/asso/projets` | nominal, vide, filtre-sans-resultat | `design/screens/gestionnaire/*/MgProjets__*.png` |
| MgNouveauProjet | `/asso/projets/nouveau` | 1, 2, 3, 4, 5, 6, succes | `design/screens/gestionnaire/*/MgNouveauProjet__*.png` |

## Points d'attention

- Le tableau de bord gestionnaire **fixe le style** de tout l'espace (KPI, cartes, barre latérale) : soigne-le en premier.
- Barre latérale : entrée active en `brand-pale`/`brand-dark`, compteur orange « Paiements 6 ». Barre supérieure : fil
  d'Ariane, recherche, cloche (3), avatar avec menu (profil, déconnexion → `/connexion/association`).
- Mobile gestionnaire : navigation basse 5 entrées (Accueil, Projets, Paiements, Membres, Plus) — `ManagerMobileNav`
  (créé au lot 01), comme dans les captures mobiles.
- Projets : vue cartes / tableau, filtres par statut (chips avec compteurs), recherche, états vide et filtre sans résultat.
- Création de projet : formulaire en 6 étapes + écran de succès, état partagé entre étapes, validation par étape,
  aperçu de l'échéancier calculé (fonds d'entrée + N échéances). `POST /api/projets`.
- Onboarding `/asso/bienvenue` : 4 étapes, puis redirection vers `/asso`.

## Fin de lot

- Chaque état de chaque écran vérifié avec `/verifier-ecran` (web et mobile).
- `/revue-lot 04`, corrections, typecheck + lint.
- Compte rendu : écarts assumés, placeholders restants, questions. Commit : `feat(gestionnaire-a): lot 04 — gestionnaire a — accueil et projets`.
