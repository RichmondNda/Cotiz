---
description: Démarrer un lot d'implémentation (lecture, vérifications, plan)
argument-hint: <id du lot, ex. 2.4>
---
Nous démarrons le lot $ARGUMENTS.

0. Si l'argument est un numéro de lot front à deux chiffres (`00` à `09`), arrête-toi : c'est `/lot-front` (lots terminés).

1. Lis `docs/lots/$ARGUMENTS-*.md` en entier, puis chaque document de sa section « À lire ».
2. Vérifie dans `docs/progress.md` que toutes ses dépendances sont `terminé`. Sinon, arrête-toi et dis-moi lesquelles manquent.
3. Vérifie dans `docs/decisions.md` les décisions listées par le lot. Si l'une est `ouvert`, pose-moi la question avant tout.
4. Crée la branche `lot/$ARGUMENTS-<slug du fichier>` si elle n'existe pas.
5. Propose un plan : pour chaque étape du lot, les fichiers que tu vas créer ou modifier, les tests que tu vas écrire, et la vérification prévue. Signale toute contradiction entre le lot et `docs/specs/`.
6. **Ne modifie aucun fichier** avant que j'aie validé le plan. Ensuite, on avance étape par étape avec `/etape`.
