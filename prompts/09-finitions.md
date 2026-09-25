# Lot 09 — Finitions et passage de relais au back-end

> Session Claude Code neuve (`/clear`), avec `/lot 09`. Règles : `CLAUDE.md`.

## Objectif

Rendre la V0 cohérente de bout en bout et préparer le branchement NestJS.

## Précision 
Le dossier de travail du frontend est le dossier frontend c'est dans celui là qu'il faut travailler pour la partie front

## À faire

1. **Parcours complets** (Playwright, en script `tests/e2e/` ou manuellement avec captures) :
   - public → demande → confirmation ;
   - connexion souscripteur → accueil → projet en retard → déclarer un paiement → confirmation → historique ;
   - connexion gestionnaire → tableau de bord → paiements à valider → détail → valider → grille du projet mise à jour ;
   - connexion plateforme → demande → approbation → association visible dans la liste.
   Corrige chaque lien mort, redirection manquante ou compteur incohérent.
2. **Liens morts** : aucun `href="#"`, aucun bouton sans action ; les actions V2 affichent « Bientôt disponible ».
3. **Pages d'erreur** : `error.vue` (404, 500) dans le style Cotiz, avec retour vers l'espace courant.
4. **Accessibilité** : ordre de tabulation, focus visible, libellés des boutons icône, `aria-live` des toasts, contrastes
   (voir la section accessibilité de `design/design-system/README.md`), cibles ≥ 44 px en mobile.
5. **Cohérence des données** : un même souscripteur a les mêmes montants sur tous les écrans (Moussa, Awa, Centre
   communautaire). Liste tous les placeholders restants (`[N]`, `[MONTANT]`…) dans un tableau.
6. **Contrat d'API** : génère `docs/api-v0.md` à partir de `server/api/` : chaque endpoint (méthode, route, paramètres,
   forme de la réponse, scénarios, erreurs). C'est la spec que le back-end NestJS devra respecter.
7. `/revue-lot` global : relance la revue sur tout `app/` et corrige.

## Fin de lot

Compte rendu (parcours OK, corrections, dette restante) + commit : `chore: finitions V0 et contrat d'API`.
