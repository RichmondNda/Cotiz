# Mode d'emploi — implémenter le front Cotiz avec Claude Code

## Installation (une fois)

À la racine du repo Nuxt (dans WSL) :

```bash
unzip cotiz-front-kit.zip -d /tmp/cotiz-kit
cp -r /tmp/cotiz-kit/{design,prompts,scripts,.claude} .
# CLAUDE.md : s'il n'existe pas, copie-le ; sinon fusionne son contenu avec le tien
cp -n /tmp/cotiz-kit/CLAUDE.md .
git add design prompts scripts .claude CLAUDE.md && git commit -m "docs: kit de passation maquette Cotiz"
```

Contenu :

| Élément | Rôle |
|---|---|
| `CLAUDE.md` | Règles permanentes, lues automatiquement par Claude Code à chaque session |
| `design/` | Captures (323, tous les états), HTML rendu, CSS du DS, specs, sources de la maquette, données de référence |
| `prompts/NN-*.md` | Un prompt par lot |
| `.claude/commands/` | `/lot`, `/verifier-ecran`, `/revue-lot` |
| `frontend/scripts/capture-ecran.mjs` | Capture une route en 1440 et 390 px pour la comparer aux maquettes |

## Déroulé d'un lot

1. `git switch -c lot-NN` (une branche par lot).
2. `claude` puis `/clear` si une session précédente est ouverte.
3. Passe en **mode plan** (Maj+Tab) et tape `/lot NN`. Claude lit les références et propose un plan : relis, corrige, valide.
4. Il implémente écran par écran et se vérifie avec `/verifier-ecran`. Interviens si tu vois une dérive.
5. `/revue-lot NN`, puis corrections.
6. Vérifie toi-même dans le navigateur (`cd frontend && npm run dev`), en desktop et en mobile (outils de dev, 390 px).
7. Commit, merge, `/clear`, lot suivant.

## Ordre des lots

| Lot | Contenu | Écrans |
|---|---|---|
| 00 | Démarrage : styles globaux, structure, outillage | — |
| 01 | Fondations : composants DS, composants métier, layouts, mocks, session | page `/_dev/composants` |
| 02 | Espace public | 8 |
| 03 | Espace souscripteur | 12 |
| 04 | Gestionnaire A — onboarding, tableau de bord, projets, création | 4 |
| 05 | Gestionnaire B — détail projet (6 onglets), ajout, import | 8 |
| 06 | Gestionnaire C — paiements, souscripteurs, relances, contrats | 6 |
| 07 | Gestionnaire D — équipe, abonnement, paramètres, notifications, profil, menu Plus | 6 |
| 08 | Super-admin | 11 |
| 09 | Finitions, parcours complets, contrat d'API pour NestJS | — |

Les lots 00 et 01 sont indispensables et dans cet ordre. Ensuite, 02 à 08 peuvent être réordonnés
(par exemple gestionnaire avant souscripteur si tu veux démontrer le back-office d'abord).

## Conseils

- **Une session = un lot.** Si une session devient longue (contexte chargé, réponses qui oublient des règles),
  fais `/compact` ou termine l'écran en cours, commite, `/clear`, et relance `/lot NN` en précisant les écrans restants.
- **Corrige les règles, pas seulement le code** : si Claude refait deux fois la même erreur, ajoute une ligne dans
  `CLAUDE.md` (section concernée). Elle servira à tous les lots suivants.
- Le lot 01 conditionne tout : n'hésite pas à y passer plus de temps et à le découper en deux sessions
  (composants de base, puis métier + layouts + mocks).
- Pour relancer un seul écran : « Reprends l'écran MgPaiement du lot 06 : états `rejet` et `pdf` non conformes. »
- Garde un œil sur les points ouverts : dashboard souscripteur en `/accueil` (la spec dit `/`) et retard de Moussa
  (50 000 F dans les maquettes, 30 000 F dans la spec).
