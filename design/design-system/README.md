Cotiz gère les cotisations des associations d'Afrique de l'Ouest francophone, en franc CFA. Le système a une seule marque et trois univers : un **socle fonctionnel commun** qui ne change jamais, et une **couleur d'identité par profil** qui colore la navigation, les boutons principaux et les états actifs. On sait en un coup d'œil dans quel espace on se trouve, sans réapprendre le sens des couleurs.

## Ton et contenu

- Chaleureux et convivial, mais sobre et rassurant : on parle d'argent. Phrases courtes, vouvoiement, pas d'emoji dans l'interface.
- Utiliser le vocabulaire du produit : **projet** (pas campagne ni collecte), **souscripteur** (pas client, utilisateur ni adhérent), **échéance** (pas mensualité ni facture), **fonds d'entrée**, **déclarer un paiement** (on ne paie pas dans l'app), **valider** (pas approuver ni encaisser).
- Montants au format `25 000 F` : espace fine comme séparateur de milliers, pas de décimales (`Cotiz.formatFCFA(25000)`). Dans les champs, suffixe « F CFA ».
- Un bouton porte le verbe de son action (« Retirer du projet », « Valider le paiement »), jamais « OK ». Une modale de confirmation pose une question qui nomme l'objet.
- États vides : ton encourageant ; « Rien à valider » est une bonne nouvelle, montrée en vert.
- Données de maquette : toujours les mêmes personnes et montants (Awa Koné, gestionnaire d'Entraide Yopougon ; Moussa Diarra, souscripteur, 395 000 F restants dont 30 000 F en retard ; Centre communautaire à 25 000 F par mois).

## Les trois univers

Poser `data-theme` sur `<body>` (ou sur n'importe quel conteneur) : `manager` (gestionnaire, violet `#7F77DD`, fond beige `#F4F2ED`), `superadmin` (indigo `#3B3470`, fond gris froid `#F2F2F8`), `member` (souscripteur, corail `#D85A30`, fond corail pâle `#FAECE7`). L'attribut `data-role` de la charte fonctionne aussi. Les composants ne lisent que `brand`, `brand-dark`, `brand-pale` et `page` : aucun composant n'est dupliqué par profil.

- **Super-admin** : dense, sobre, orienté tableaux, desktop uniquement.
- **Gestionnaire** : l'espace de travail quotidien. Beaucoup de données, mais toujours une action principale évidente par écran.
- **Souscripteur** : mobile d'abord, pour des personnes pas forcément à l'aise avec le numérique. Gros boutons, peu de tableaux, un montant dominant par écran.
- **Site public** : la vitrine, où violet et corail se mêlent. Sections alternées `corail-page` / blanc.

## Fondations visuelles

- **Couleurs de statut** : `success` (payé, validé), `danger` (retard, erreur), `warning` (en attente, déclaré), `info` (à venir, information). Leur sens est fixe : elles ne servent jamais de décoration et ne sont jamais réattribuées. Un bouton vert valide toujours quelque chose. Texte sur fond clair : la paire `*-fg` sur `*-bg`. Un badge porte toujours un libellé.
- **Neutres** : `text-strong` pour les valeurs et les noms, `text` pour le courant, `text-muted` pour le secondaire, `text-disabled` réservé à l'inactif. Surfaces : cartes `surface` sur fond `page`, jamais de blanc pur en fond de page.
- **Typographie** : Poppins pour les titres, les boutons et les chiffres clés (600, ou 500 pour les commandes) ; Inter pour le corps, les tableaux et les données. Échelle : H1 28, H2 20, H3 16, KPI 26, corps 14, tableau 13,5, légende 12, en-tête de tableau 11,5 en majuscules. Le site public ajoute 44 pour le héros et 32 pour les titres de section.
- **Espacement** : 4 · 8 · 12 · 16 · 24 · 32 · 48, et rien d'autre. Padding de carte 24, ou 16–18 sur mobile.
- **Rayons** : `r-field` 10 pour les boutons et les champs, `r-card` 16 pour les cartes, `r-card-lg` 18 pour l'espace souscripteur et les modales, `r-pill` pour les badges. Les valeurs intermédiaires de la spécification (6, 7, 8, 9, 12, 14, 20) ont chacune leur token.
- **Ombres** : très douces, teintées `rgba(40,30,80,…)`. `shadow` au repos, `shadow-hover` au survol d'une carte cliquable, `shadow-menu` et `shadow-modal` pour ce qui flotte.
- **États** : survol assombri vers `brand-dark` (plein) ou `brand-pale` (contour, fantôme) ; focus avec un halo de 3 px `brand-pale` (`focus-ring`) accompagné d'une bordure `brand` sur les champs ; chargement avec le spinner `cz-spin` et un libellé au participe présent ; désactivé en `disabled-bg` / `text-disabled`. Pour le chargement de contenu : des squelettes, jamais de spinner plein écran.
- **Mise en page** : back-office avec une barre latérale de 240 px (72 repliée), une barre supérieure de 64 et un contenu de 1280 max. Souscripteur : colonne unique, navigation basse à 4 entrées et bouton flottant « Déclarer un paiement », contenu de 960 sur desktop.

## Accessibilité — paires à surveiller (valeurs de la charte conservées telles quelles)

- Blanc sur `violet` : 3,8:1. Blanc sur `corail` : 3,9:1. Blanc sur `success` : 3,4:1. Ces paires conviennent aux textes de 18,66 px gras ou plus, mais restent sous le seuil AA de 4,5:1 pour les libellés de bouton en 14 px. Blanc sur `indigo` (11:1), sur `brand-dark` (≥ 6:1) et sur `danger` (4,55:1) sont conformes. Si une conformité AA stricte est exigée, on peut par exemple mettre les libellés du bouton primaire en `brand-dark`, à valider avec la charte.
- `focus-ring` seul (`brand-pale` sur blanc) est à 1,2:1 : sur les champs, la bordure `brand` porte l'indication de focus ; sur les boutons, l'anneau reste peu visible. À arbitrer.
- `warning` n'accueille jamais de texte blanc (2,4:1). `cell-future` (1,3:1 sur blanc) : l'état « à venir » est aussi porté par l'infobulle et par les motifs optionnels de la grille.
- Jamais d'information portée par la couleur seule : chaque badge a un texte, et la grille d'échéances propose des motifs (✓ ! ◔ …). Cibles tactiles ≥ 44 px sur mobile.

## Iconographie

- Trait de 1,75 px, extrémités et jonctions arrondies, grille de 24 px, en écho au C arrondi du logo. Le même jeu sert aux trois profils : la couleur suit `brand`, sauf pour les icônes de statut, qui gardent leur couleur fonctionnelle.
- Les 11 icônes de la charte (échéance, souscripteurs, paiement, contrat, notification, plateforme, validé, rejeté, alerte, projet, mon espace) sont reprises à l'identique.
- Les 33 icônes d'interface complémentaires (tableau de bord, recherche, paramètres, chevrons…) ont été **dessinées sur la même grille, dans le style Lucide** demandé par la spécification. Le paquet Lucide officiel n'était pas accessible pendant la construction : on peut les remplacer par leurs équivalents Lucide sans changer la grille ni l'épaisseur.
- Dans le code, écrire `<i data-icon="paiement"></i>` puis appeler `Cotiz.hydrate()`, ou utiliser `Cotiz.icon(nom, taille)`. Les SVG de `assets/Icons` sont encrés en `#2C2A38` (`text`).

## Logo

`assets/Logos/cotiz-logo.png` : le logo complet (mot-symbole `ink-title` et slogan `corail-dark`). `cotiz-mark.svg` : le symbole seul, repris du code de la charte. Ne jamais le recolorer ni le redessiner ; dans l'interface, utiliser `Cotiz.mark(taille)`.
