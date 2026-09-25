# Icones

Grille d'icônes 24 px, trait 1,75 px, extrémités et jonctions arrondies, en écho au C du logo.

- Même jeu pour les trois profils ; la couleur suit `brand`, sauf les icônes de statut (validé, rejeté, alerte, information) qui gardent leur couleur fonctionnelle.
- Dans le code : `<i data-icon="paiement"></i>` puis `Cotiz.hydrate()`, ou `Cotiz.icon('paiement', 18)` ; le SVG hérite de `currentColor`.
- Tailles : 14 (badge, aide), 18 (bouton), 24 (navigation), 26–32 (état vide).
