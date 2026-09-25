# Lot 01 — Fondations : composants, layouts, mocks

> Session Claude Code neuve (`/clear`), avec `/lot 01`. Règles : `CLAUDE.md`.
> Ce lot conditionne la cohérence de tout le reste : prends le temps, vérifie tout.

## Objectif

Construire tout ce que les écrans réutiliseront : composants du design system en Vue, composants métier, les 4 layouts,
la session mockée, et l'infrastructure de mocks. **Toujours aucun écran métier** : seulement une page de démonstration.

## Précision 
Le dossier de travail du frontend est le dossier frontend c'est dans celui là qu'il faut travailler pour la partie front

## Références

- `design/design-system/README.md` (règles), `design/design-system/components/<Composant>/README.md` + `preview.html`
  (toutes les variantes et tous les états côte à côte : c'est la cible de chaque composant).
- `design/css/bundle.css` : les classes `cz-*` existent déjà. Les composants Vue **enveloppent ces classes**, ils ne
  réécrivent pas le CSS.
- `design/design-system/bundle.js` : icônes (`Cotiz.icon`), symbole (`Cotiz.mark`), `formatFCFA`, `allocate`
  (répartition d'un montant sur des échéances) — à porter en TypeScript.
- `design/screens/composants-partages/web/*.png` + `design/html/composants-partages/` : en-têtes, barres latérales,
  navigations basses.

## 1. Utilitaires (`app/utils/`)

- `formatFCFA(n)` → `25 000 F` (U+202F), `formatDate`, `formatRelatif` (« il y a 3 j », « hier »), `formatTelephone`.
- `allocate(montant, echeances)` : répartit sur les échéances les plus anciennes d'abord (port de `Cotiz.allocate`),
  avec tests unitaires (Vitest) : paiement exact, partiel, trop élevé.
- `icons.ts` : les 44 icônes (chemins SVG de `bundle.js` / `design/assets/icons/`).

## 2. Composants de base (`app/components/cz/`)

Au minimum, en couvrant **toutes** les variantes et tous les états de leur `preview.html` :
`CzIcon`, `CzLogo`, `CzButton` (primaire, secondaire, fantôme, succès, danger, contour danger, tailles, bloc, icône,
chargement, désactivé, `to` pour NuxtLink), `CzBadge`, `CzCount`, `CzAvatar`, `CzField` (label, aide, erreur), `CzInput`
(préfixe, suffixe « F CFA », recherche, zone de texte, erreur, `v-model`), `CzSelect`, `CzCheckbox`, `CzToggle`,
`CzSegmented`, `CzCounter`, `CzFileDrop`, `CzCard`, `CzKpi`, `CzTile`, `CzTable` (colonnes, `num`, tri, sélection,
pagination, pied de tableau, barre d'actions groupées), `CzTabs` (liés à la route), `CzSteps`, `CzChips`,
`CzAlert`, `CzToast` (+ `useToast()` avec action « Annuler »), `CzModal`, `CzSheet` (feuille basse mobile),
`CzPanel` (panneau latéral), `CzMenu`, `CzEmpty`, `CzSkeleton`, `CzSoon` (« Bientôt disponible »), `CzProgress`, `CzCrumb`.

Règle transversale : un composant « superposé » (`CzModal`) bascule automatiquement en `CzSheet` sous 768 px
(`useBreakpoint()`), comme dans les captures mobiles. Focus piégé, `Échap`, `aria-*`, retour du focus à la fermeture.

## 3. Composants métier (`app/components/metier/`)

`GrilleEcheances`, `SelecteurEcheances`, `CarteProjet` (variantes gestionnaire et souscripteur : retard, signature,
terminé, brouillon), `CarteSynthese`, `CarteAssociation`, `VisionneusePreuve` (image, PDF, référence), `Frise`
(historique), `NotificationItem`, `Graphiques` simples (barres de recouvrement), `ProchaineEcheance`, `ActionCard`.
Références : previews correspondants dans `design/design-system/components/`.

## 4. Layouts et navigation

- `public.vue` (PublicHeader + PublicFooter), `auth.vue` (écran scindé 50/50, panneau à la couleur du profil),
  `backoffice.vue` (barre latérale 240/72 + barre supérieure 64 + contenu 1280 max ; thème `manager` ou `superadmin`
  selon l'espace ; menu tiroir en mobile pour le super-admin ; navigation basse 5 entrées pour le gestionnaire mobile),
  `souscripteur.vue` (thème `member` ; navigation basse 4 entrées + bouton flottant en mobile ; barre latérale + contenu
  960 px en desktop).
- Menus construits à partir d'une config (`app/config/navigation.ts`), compteurs alimentés par l'API mockée.

## 5. Mocks et session

- `server/mocks/` : toutes les données de `design/DONNEES-REFERENCE.md`, typées avec `types/`. Store en mémoire.
- `server/api/` : squelette des endpoints en lecture pour chaque ressource (associations, projets, souscripteurs,
  échéances, paiements, contrats, notifications, plans, demandes, compteurs de navigation), latence 200–400 ms,
  support de `?scenario=`. Les mutations viendront avec les lots qui en ont besoin.
- `composables/api/` : un composable par ressource (`useProjets`, `useProjet(id)`…) qui expose `data`, `pending`, `error`.
- `useSession()` + cookie `cotiz_role` + middlewares `espace-souscripteur`, `espace-gestionnaire`, `espace-plateforme`.

## 6. Page de démonstration

`/_dev/composants` (dev uniquement) : chaque composant avec toutes ses variantes, sélecteur de thème
(member / manager / superadmin). Vérifie-la contre les `preview.html` du design system (ouvre-les dans le navigateur
via Playwright pour les capturer) : c'est le critère de fin de ce lot.

## Fin de lot

- `/verifier-ecran /_dev/composants` comparé aux previews, pour les 3 thèmes.
- Tests de `allocate` et `formatFCFA` au vert ; typecheck + lint.
- Compte rendu + commit : `feat(fondations): composants du design system, layouts, mocks et session`.
