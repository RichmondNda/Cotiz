---
description: Revue de fin de lot contre la checklist Cotiz
argument-hint: <numéro du lot>
---
Fais la revue du lot `prompts/$ARGUMENTS-*.md` sans rien modifier d'abord.

Pour chaque écran du lot, contrôle la « Définition de terminé » de `CLAUDE.md` et la checklist de la section 11 de
`design/specs/cotiz-spec-ui.html` (objectif, action principale unique par zone, couleur d'espace, statuts, montants,
vocabulaire, états vide/chargement/erreur, mobile ≥ 44 px, accessibilité, cohérence des données).

Vérifie aussi, dans le code :
- aucune couleur hexadécimale hors tokens (`grep -rnE "#[0-9A-Fa-f]{3,6}" app/ --include=*.vue`), aucun `href="#"` ;
- aucun import direct de `server/mocks` depuis `app/` ;
- aucun composant dupliqué entre pages (ce qui est répété deux fois doit être dans `components/`) ;
- tous les liens du lot mènent à des routes existantes.

Rends un tableau : écran · statut (OK / à corriger) · problèmes. Puis propose les corrections et attends mon accord.
