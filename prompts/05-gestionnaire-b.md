# Lot 05 — Gestionnaire B — détail projet

> À lancer dans une session Claude Code neuve (`/clear`), à la racine du repo, avec `/lot 05` ou en collant ce fichier.
> Règles : `CLAUDE.md`. Références : `design/INVENTAIRE.md`, `design/DONNEES-REFERENCE.md`.

## Objectif

Implémente le détail d'un projet avec ses 6 onglets, l'ajout de souscripteur et l'import Excel. Projet de référence :
Centre communautaire.

## Écrans

| Écran | Route | États (web / mobile) | Captures |
|---|---|---|---|
| MgProjet | `/asso/projets/[id]` | en-cours, inscriptions-ouvertes, termine, aucun-retard | `design/screens/gestionnaire/*/MgProjet__*.png` |
| MgProjetSouscripteurs | `/asso/projets/[id]/souscripteurs` | web : etat-nominal, etat-aucun-souscripteur, etat-selection-multiple, modale-telephone, modale-compte-existant, modale-nouveau, modale-deja-inscrit · mobile : nominal, aucun-souscripteur, retrait-confirmation | `design/screens/gestionnaire/*/MgProjetSouscripteurs__*.png` |
| MgAjoutSouscripteur | `/asso/projets/[id]/souscripteurs (modale)` | telephone, compte-existant, nouveau, deja-inscrit | `design/screens/gestionnaire/*/MgAjoutSouscripteur__*.png` |
| MgProjetPaiements | `/asso/projets/[id]/paiements` | web : grille-nominale, beaucoup-de-retards, panneau-echeance, vue-liste · mobile : grille-nominale, detail-echeance, vue-liste | `design/screens/gestionnaire/*/MgProjetPaiements__*.png` |
| MgProjetContrat | `/asso/projets/[id]/contrat` | nominal, tous-signes | `design/screens/gestionnaire/*/MgProjetContrat__*.png` |
| MgProjetParametres | `/asso/projets/[id]/parametres` | web : défaut · mobile : nominal, confirmation-cloture, enregistre | `design/screens/gestionnaire/*/MgProjetParametres__*.png` |
| MgProjetRapports | `/asso/projets/[id]/rapports` | nominal, graphiques-bientot-disponibles | `design/screens/gestionnaire/*/MgProjetRapports__*.png` |
| MgImport | `/asso/projets/[id]/import` | 1-fichier, fichier-invalide, 2-colonnes, 3-verification, 4-envoi, import-termine | `design/screens/gestionnaire/*/MgImport__*.png` |

## Points d'attention

- Un layout imbriqué `pages/asso/projets/[id].vue` porte `ProjetHeader` (titre, statut, chiffres clés, onglets) et un
  `<NuxtPage />` ; les onglets sont synchronisés avec l'URL, compteur orange quand une action est en attente,
  défilement horizontal en mobile avec l'onglet actif centré.
- **Grille d'échéances** (`GrilleEcheances`, composant métier le plus complexe) : une ligne par souscripteur, une cellule
  par échéance (1re = fonds d'entrée), codes et séquences dans DONNEES-REFERENCE. Cellules cliquables (bouton accessible
  avec libellé « mois · montant · statut ») → panneau latéral (desktop) / feuille basse (mobile) avec détail et action
  « Valider » pour une cellule déclarée. La validation met à jour la grille (flash) et les compteurs. Vue liste alternative.
  Légende avec texte (jamais la couleur seule).
- Ajout de souscripteur : modale (desktop) / feuille (mobile) avec les 4 cas de l'inventaire (saisie du téléphone,
  compte existant retrouvé, nouveau compte, déjà inscrit au projet). Numéros mockés documentés pour chaque cas.
- Souscripteurs : sélection multiple avec barre d'actions groupées (`cz-bulk`), confirmation de retrait.
- Import : 4 étapes (fichier, correspondance des colonnes, vérification, envoi) + fichier invalide + import terminé.
  Le fichier peut être simulé (pas besoin de parser un vrai Excel en V0) ; bouton « Télécharger le modèle Excel ».
- Paramètres : confirmation de clôture du projet ; Rapports : état « graphiques bientôt disponibles ».

## Fin de lot

- Chaque état de chaque écran vérifié avec `/verifier-ecran` (web et mobile).
- `/revue-lot 05`, corrections, typecheck + lint.
- Compte rendu : écarts assumés, placeholders restants, questions. Commit : `feat(gestionnaire-b): lot 05 — gestionnaire b — détail projet`.
