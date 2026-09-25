# Palette

Les trois univers d'identité et le socle fonctionnel commun, avec leurs valeurs exactes.

- Choisir l'univers avec `data-theme="manager | superadmin | member"` sur `<body>` (ou `data-role`, nom de la charte) : `brand`, `brand-dark`, `brand-pale` et `page` prennent alors l'indigo, le violet ou le corail.
- Dans un composant, ne référencer que ces alias, jamais `indigo`, `violet` ou `corail` directement — sauf le site public, qui mêle violet et corail.
- Les quatre couleurs fonctionnelles (`success`, `danger`, `warning`, `info`) gardent un sens fixe dans les trois univers et ne servent jamais de décoration. Texte sur fond clair : toujours la paire `-fg` sur `-bg`.
- Fond de page : toujours `page`, jamais blanc pur ; les cartes posent en `surface`.
