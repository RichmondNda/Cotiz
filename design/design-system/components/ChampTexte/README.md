# ChampTexte

Saisie de texte, montant, téléphone, date, recherche, sélecteur et zone de texte.

- Structure : `cz-field` > `cz-label` (13/600, astérisque `danger` si obligatoire) + `cz-input` (44 px) + `cz-help` ou `cz-error`.
- États : repos, survol (bordure `text-disabled`), focus (bordure `brand` + `focus-ring`), rempli, erreur (`.is-error` : bordure `danger` + halo `danger-bg`, message précédé d'une icône), désactivé, lecture seule, chargement (spinner à droite).
- Validation à la perte de focus, jamais à chaque frappe.
- Montant : `--suffix` « F CFA », milliers formatés à la saisie, clavier numérique. Téléphone : `--prefix` indicatif, +225 par défaut. Sélecteur : chevron à droite ; au-delà de 8 options, avec recherche.
