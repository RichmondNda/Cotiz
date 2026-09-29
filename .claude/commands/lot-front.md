---
description: Lot front V0 (prompts/NN, terminés) — ex. /lot-front 03
argument-hint: <numéro du lot, ex. 02>
---
Lis `prompts/$ARGUMENTS-*.md` (le fichier dont le nom commence par `$ARGUMENTS`) et exécute ce lot en respectant `CLAUDE.md` et `frontend/CLAUDE.md`.

Déroulé obligatoire :
1. Lis les captures (`design/screens/...`) et le HTML de référence (`design/html/...`) de chaque écran du lot,
   ainsi que la fiche correspondante dans `design/specs/cotiz-spec-ui.html`.
2. Présente-moi un plan court : composants à créer ou réutiliser, pages, endpoints mockés, ordre de travail.
   Attends mon feu vert avant de coder.
3. Implémente écran par écran. Après chaque écran, lance `/verifier-ecran` sur ses états principaux et corrige les écarts.
4. En fin de lot : typecheck + lint, puis un compte rendu : écrans faits, écarts restants assumés, données inventées ou
   placeholders, questions ouvertes. Propose un message de commit (ne commite pas sans mon accord).
