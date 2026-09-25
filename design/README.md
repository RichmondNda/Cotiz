# design/ — passation de la maquette Cotiz (lecture seule)

| Dossier / fichier | Contenu |
|---|---|
| `INVENTAIRE.md` | Tous les écrans : route, états, captures. **Commencer ici.** |
| `DONNEES-REFERENCE.md` | Données mockées de référence (personnes, projets, montants) |
| `screens/<espace>/<web\|mobile>/<Écran>__<état>.png` | Captures de la maquette (web 1440 px, mobile 390 px déroulé sur toute la hauteur) |
| `html/<espace>/<web\|mobile>/<Écran>__<état>.html` | HTML rendu de chaque capture (structure, classes `cz-*`, textes exacts). S'ouvre dans un navigateur |
| `screens/composants-partages/`, `html/composants-partages/` | En-têtes, barres latérales, navigations basses, en-tête de projet |
| `css/cotiz-tokens.css` | Tokens (couleurs, thèmes `data-theme`, typographie, rayons, espacements, ombres) |
| `css/bundle.css` | Classes du design system (`cz-btn`, `cz-card`, `cz-grid`, `cz-pcard`…) |
| `design-system/` | Documentation du DS : `README.md` (règles), `components/<C>/README.md` + `preview.html` (toutes variantes et états), `bundle.js` (icônes, `formatFCFA`, `allocate`), `tokens.json` |
| `assets/logos/`, `assets/icons/` | Logo officiel (ne pas modifier) et 44 icônes SVG |
| `specs/cotiz-spec-ui.html` | Spécification UI : fiche de chaque écran (objectif, zones, interactions, états), checklist |
| `specs/cotiz-charte-graphique.html` | Charte graphique validée |
| `source-maquette/*.dc.html` | Source de la maquette Claude Design. Lire le bloc `renderVals()` pour la logique et les données ; ne pas copier la syntaxe de templating |

Espaces : `public`, `souscripteur`, `gestionnaire`, `super-admin`.
Les écrans de la maquette nommés `Mb*` = souscripteur, `Mg*` = gestionnaire, `Sa*` = super-admin.

Les chiffres visibles dans les `preview.html` du design system sont illustratifs (ils montrent des variantes).
Pour les données des écrans, seuls `DONNEES-REFERENCE.md` et les captures font foi.
