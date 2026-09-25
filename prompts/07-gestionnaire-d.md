# Lot 07 — Gestionnaire D — compte et paramètres

> À lancer dans une session Claude Code neuve (`/clear`), à la racine du repo, avec `/lot 07` ou en collant ce fichier.
> Règles : `CLAUDE.md`. Références : `design/INVENTAIRE.md`, `design/DONNEES-REFERENCE.md`.

## Objectif

Implémente équipe, abonnement, paramètres de l'association, notifications, profil, et le menu « Plus » mobile.

## Écrans

| Écran | Route | États (web / mobile) | Captures |
|---|---|---|---|
| MgEquipe | `/asso/equipe` | web : nominal, modale-invitation, quota-atteint · mobile : nominal, invitation, quota-atteint | `design/screens/gestionnaire/*/MgEquipe__*.png` |
| MgAbonnement | `/asso/abonnement` | actif, echeance-proche, suspendu | `design/screens/gestionnaire/*/MgAbonnement__*.png` |
| MgParametres | `/asso/parametres` | nominal, modifications-non-enregistrees, enregistre | `design/screens/gestionnaire/*/MgParametres__*.png` |
| MgNotifications | `/asso/notifications` | nominal, tout-lu, vide | `design/screens/gestionnaire/*/MgNotifications__*.png` |
| MgProfil | `/asso/profil` | nominal, changement-mot-de-passe, mot-de-passe-modifie | `design/screens/gestionnaire/*/MgProfil__*.png` |
| MgPlus | `/asso/plus (mobile uniquement)` | web : — · mobile : défaut | `design/screens/gestionnaire/*/MgPlus__*.png` |

## Points d'attention

- `MgPlus` n'existe qu'en mobile : c'est la destination de l'entrée « Plus » de la navigation basse (liens vers Relances,
  Contrats, Notifications, Équipe, Abonnement, Paramètres, Profil, Déconnexion). En desktop, `/asso/plus` redirige vers `/asso`.
- Paramètres : barre « modifications non enregistrées » (Annuler / Enregistrer) qui apparaît dès qu'un champ change,
  alerte de succès après enregistrement. Garde de navigation si des modifications ne sont pas enregistrées.
- Équipe : invitation (modale / feuille), quota atteint (bouton désactivé + explication).
- Abonnement : états actif, échéance proche, suspendu ; « Demander un changement de formule ».
- Notifications : groupes par période, filtres, « Tout lire », état vide ; mêmes données que la cloche.

## Fin de lot

- Chaque état de chaque écran vérifié avec `/verifier-ecran` (web et mobile).
- `/revue-lot 07`, corrections, typecheck + lint.
- Compte rendu : écarts assumés, placeholders restants, questions. Commit : `feat(gestionnaire-d): lot 07 — gestionnaire d — compte et paramètres`.
