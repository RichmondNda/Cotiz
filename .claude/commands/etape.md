---
description: Réaliser une étape d'un lot, de bout en bout
argument-hint: <id du lot> <numéro de l'étape>
---
Réalise l'étape indiquée ($ARGUMENTS) du lot correspondant dans `docs/lots/`.

Ordre imposé :
1. Relis l'étape et sa vérification. Si elle touche un échange HTTP, commence par `packages/contracts`.
2. Écris les tests d'abord et lance-les pour les voir échouer (obligatoire pour la logique d'argent et l'isolation).
3. Implémente jusqu'au vert, en respectant les règles du `CLAUDE.md` racine et de celui du dossier touché (`frontend/`, `backend/`, `packages/*`).
4. Lance `pnpm verify`. Corrige jusqu'au vert.
5. Si l'étape touche la base, la sécurité ou l'argent : lance les sous-agents `isolation-reviewer` et `money-reviewer` sur `git diff` et traite leurs remarques.
6. Commit (Conventional Commits). Termine par : ce qui est fait, la vérification de l'étape et son résultat, ce qui reste dans le lot.
