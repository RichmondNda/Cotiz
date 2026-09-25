# Lot 08 — Espace super-admin

> À lancer dans une session Claude Code neuve (`/clear`), à la racine du repo, avec `/lot 08` ou en collant ce fichier.
> Règles : `CLAUDE.md`. Références : `design/INVENTAIRE.md`, `design/DONNEES-REFERENCE.md`.

## Objectif

Implémente les 11 écrans de l'espace plateforme (thème `superadmin`, indigo, desktop uniquement) dans le layout
`backoffice`. Utilisateur connecté : Richy.

## Précision 
Le dossier de travail du frontend est le dossier frontend c'est dans celui là qu'il faut travailler pour la partie front

## Écrans

| Écran | Route | États (web / mobile) | Captures |
|---|---|---|---|
| SaDashboard | `/plateforme` | web : nominal, aucune-demande · mobile : — | `design/screens/super-admin/*/SaDashboard__*.png` |
| SaDemandes | `/plateforme/demandes` | web : nominal, vide, recherche-sans-resultat · mobile : — | `design/screens/super-admin/*/SaDemandes__*.png` |
| SaDemande | `/plateforme/demandes/[id]` | web : a-traiter, approuvee, refusee, modale-approbation, modale-refus · mobile : — | `design/screens/super-admin/*/SaDemande__*.png` |
| SaAssociations | `/plateforme/associations` | web : nominal, filtres-actifs, vide · mobile : — | `design/screens/super-admin/*/SaAssociations__*.png` |
| SaAssociation | `/plateforme/associations/[id]` | web : association-entraide-yopougon, association-ressortissants-man, association-jeunesse-bouake, etat-suspendue · mobile : — | `design/screens/super-admin/*/SaAssociation__*.png` |
| SaNouvelleAssociation | `/plateforme/associations/nouvelle` | web : rempli, vide, erreurs, envoi-en-cours · mobile : — | `design/screens/super-admin/*/SaNouvelleAssociation__*.png` |
| SaPlans | `/plateforme/plans` | web : nominal, aucun-plan · mobile : — | `design/screens/super-admin/*/SaPlans__*.png` |
| SaPlan | `/plateforme/plans/[id]` | web : modification, creation, avertissement-abonnes · mobile : — | `design/screens/super-admin/*/SaPlan__*.png` |
| SaFacturation | `/plateforme/facturation` | web : nominal, bientot-disponible · mobile : — | `design/screens/super-admin/*/SaFacturation__*.png` |
| SaUtilisateurs | `/plateforme/utilisateurs` | web : nominal, bientot-disponible · mobile : — | `design/screens/super-admin/*/SaUtilisateurs__*.png` |
| SaProfil | `/plateforme/profil` | web : défaut · mobile : — | `design/screens/super-admin/*/SaProfil__*.png` |

## Points d'attention

- Réutilise le layout back-office du gestionnaire avec le thème `superadmin` et le menu plateforme ; aucun composant dupliqué.
- Dense et orienté tableaux. Pas de version mobile dédiée : l'affichage doit rester utilisable en tablette.
- Traitement d'une demande : approbation (modale → crée l'association dans le store mocké) et refus (modale avec motif).
- Détail association : les 3 associations de référence (`entraide-yopougon`, `ressortissants-man`, `jeunesse-bouake`),
  état suspendu ; onglets usage et facturation marqués V2 (« Bientôt disponible »).
- Plans : édition, création, avertissement quand on modifie un plan qui a des abonnés.
- Facturation et utilisateurs : écrans « Bientôt disponible » (V2), comme dans les captures.

## Fin de lot

- Chaque état de chaque écran vérifié avec `/verifier-ecran` (web et mobile).
- `/revue-lot 08`, corrections, typecheck + lint.
- Compte rendu : écarts assumés, placeholders restants, questions. Commit : `feat(super-admin): lot 08 — espace super-admin`.
