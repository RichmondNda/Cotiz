# Tableau

Tableau de données standard avec barre d'outils, tri, sélection multiple et pagination.

- Barre d'outils : recherche à gauche, puces de filtre avec compteur, actions (export, ajout) à droite.
- En-tête `overline` sur `surface-subtle` ; colonnes triables : flèche au survol, pleine et `brand-dark` si active.
- Ligne 56 px, survol `surface-subtle`, sélection `brand-pale`, focus clavier liseré `brand` ; toute la ligne mène au détail. Actions de ligne via ⋯ et menu contextuel.
- Montants alignés à droite, chiffres tabulaires (`.num`). Sélection multiple → barre `cz-bulk` d'actions groupées.
- États vide, chargement (squelettes) et erreur (« Réessayer ») dans le cadre du tableau. Mobile : liste de cartes `cz-rowcard`.
