# Lot 06 — Gestionnaire C — paiements et souscripteurs

> À lancer dans une session Claude Code neuve (`/clear`), à la racine du repo, avec `/lot 06` ou en collant ce fichier.
> Règles : `CLAUDE.md`. Références : `design/INVENTAIRE.md`, `design/DONNEES-REFERENCE.md`.

## Objectif

Implémente la file de validation des paiements, le détail d'un paiement, l'annuaire, la fiche souscripteur, les relances
et les contrats.

## Écrans

| Écran | Route | États (web / mobile) | Captures |
|---|---|---|---|
| MgPaiements | `/asso/paiements` | file-pleine, file-vide, valides | `design/screens/gestionnaire/*/MgPaiements__*.png` |
| MgPaiement | `/asso/paiements/[id]` | web : image, pdf, reference-seule, repartition-ajustee, modale-rejet, valide · mobile : image, reference-seule, repartition-ajustee, rejet, valide | `design/screens/gestionnaire/*/MgPaiement__*.png` |
| MgSouscripteurs | `/asso/souscripteurs` | nominal, vide | `design/screens/gestionnaire/*/MgSouscripteurs__*.png` |
| MgSouscripteur | `/asso/souscripteurs/[id]` | en-retard, a-jour, contrat-non-signe | `design/screens/gestionnaire/*/MgSouscripteur__*.png` |
| MgRelances | `/asso/relances` | web : nominal, modale-relance, relance-envoyee, aucun-retard · mobile : nominal, relance-envoi, relance-envoyee, aucun-retard | `design/screens/gestionnaire/*/MgRelances__*.png` |
| MgContrats | `/asso/contrats` | nominal, detail-ouvert, aucun-contrat | `design/screens/gestionnaire/*/MgContrats__*.png` |

## Points d'attention

- File de validation : onglets « À valider (6) / Validés / Tous », validation rapide avec toast « Annuler » (undo),
  compteurs de navigation mis à jour partout (barre latérale, navigation basse, tableau de bord).
- Détail d'un paiement : **visionneuse de preuve** (image, PDF, référence seule), répartition sur les échéances
  (réutilise `SelecteurEcheances` en mode ajustement), actions Valider / Rejeter ; le rejet ouvre une modale avec motif
  obligatoire. Accessible aussi en panneau depuis la file (desktop).
- Fiche souscripteur : projets, échéancier, historique (frise), états en retard / à jour / contrat non signé.
- Relances : liste des retards, modale (desktop) / feuille (mobile) d'envoi, état envoyé, état aucun retard.
- Contrats : liste + détail ouvert (panneau), état vide.

## Fin de lot

- Chaque état de chaque écran vérifié avec `/verifier-ecran` (web et mobile).
- `/revue-lot 06`, corrections, typecheck + lint.
- Compte rendu : écarts assumés, placeholders restants, questions. Commit : `feat(gestionnaire-c): lot 06 — gestionnaire c — paiements et souscripteurs`.
