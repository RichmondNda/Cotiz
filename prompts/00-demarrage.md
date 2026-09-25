# Lot 00 — Démarrage du projet

> Session Claude Code neuve, à la racine du repo. Règles : `CLAUDE.md`.

## Objectif

Préparer le repo pour que tous les lots suivants partent d'une base propre. **Aucun écran dans ce lot.**

## Précision 
Le dossier de travail du frontend est le dossier frontend c'est dans celui là qu'il faut travailler pour la partie front

## À faire

1. Inspecte le repo : version de Nuxt, structure (`app/` ou racine), TypeScript, lint, scripts npm, ce qui existe déjà
   (pages, composants, config). Résume-moi l'état en quelques lignes et signale ce qui contredit `CLAUDE.md`.
   - S'il n'y a pas encore d'app Nuxt : propose la commande de création (Nuxt 4, TypeScript) et attends mon accord.
2. Styles globaux : copie `design/css/cotiz-tokens.css` et `design/css/bundle.css` dans `app/assets/css/`, charge-les via
   `nuxt.config` (`css: [...]`), ajoute `app.css` (polices Poppins + Inter via Google Fonts avec `preconnect`, reset léger,
   fond de page `var(--page)`). Ne modifie pas le contenu des deux fichiers du DS.
3. Copie les logos `design/assets/logos/` dans `public/` (sans les modifier) et configure le favicon avec `cotiz-mark.svg`.
4. Crée l'arborescence décrite dans `CLAUDE.md` (dossiers vides avec un `.gitkeep` si besoin) et `types/` avec les types
   de domaine de base : `Association`, `Projet`, `Souscripteur`, `Echeance`, `Paiement` (déclaration), `Contrat`,
   `Notification`, `Plan`, `Demande`. Déduis les champs des captures et de la spec ; commente les champs incertains.
5. Outil de vérification : `npm i -D playwright`, `npx playwright install chromium`, vérifie que
   `node scripts/capture-ecran.mjs /` produit bien `.verif/accueil__web.png` et `.verif/accueil__mobile.png`.
   Ajoute `.verif/` au `.gitignore`.
6. Scripts npm : `dev`, `build`, `typecheck`, `lint` (ESLint via `@nuxt/eslint` si absent).
7. Vérifie que `npm run dev`, `npm run typecheck` et `npm run lint` passent.

## Fin de lot

Compte rendu court + message de commit proposé : `chore: socle du front Cotiz (design system, structure, outillage)`.

