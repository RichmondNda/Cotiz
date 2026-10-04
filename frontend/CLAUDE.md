# frontend/ — Nuxt 4 (V0 livrée, puis branchement sur NestJS)

Règles du front. Les règles communes (produit, vocabulaire, argent, « sans fournisseur ») sont dans le `CLAUDE.md` racine.
Les chemins ci-dessous partent de la **racine du dépôt**, sauf mention contraire.

État : V0 terminée (tous les écrans sur mocks Nitro, lots front 00–09 de `prompts/`, commande `/lot-front`).
Suite : le front est aligné sur le contrat au lot 0.3, puis chaque lot back bascule ses endpoints (`/bascule`).

## Sources de vérité pour le rendu (dans cet ordre)

1. `design/screens/**` — captures de la maquette validée (1440 px et 390 px), une par état. C'est ce qu'on doit obtenir.
2. `design/html/**` — le HTML rendu de chaque capture : structure, classes `cz-*`, textes exacts.
3. `design/css/cotiz-tokens.css` + `design/css/bundle.css` — tokens et classes du design system (à utiliser tels quels).
4. `design/specs/cotiz-spec-ui.html` — spécification fonctionnelle : objectif, zones, interactions, états de chaque écran.
5. `design/source-maquette/*.dc.html` — code source de la maquette. Utile pour la **logique** (quel clic mène où, quel état
   s'affiche quand). Format de templating propriétaire : ne pas copier sa syntaxe (`{{ }}`, `<sc-if>`, `<sc-for>`).
6. `design/design-system/` — documentation du design system (règles, composants, icônes, logo).

`design/INVENTAIRE.md` liste chaque écran → route → états → fichiers. `design/DONNEES-REFERENCE.md` donne les données mockées.
`docs/specs/screens.yaml` relie chaque écran (champ `mockup` = nom dans l'inventaire) à ses endpoints et au lot où il devient réel.

En cas de conflit entre la capture et la spec : **la capture gagne**, et tu le signales dans ton compte rendu.
**Exception** : les écarts « sans fournisseur » de `docs/specs/ui-deviations.md` priment sur la capture, dans le lot indiqué.

## Règles de design (non négociables)

- **Aucune nouvelle couleur.** Uniquement les variables de `cotiz-tokens.css` (`var(--brand)`, `var(--success)`…).
  Pas de valeur hexadécimale en dur dans les composants, sauf si elle est déjà dans le HTML de référence et correspond à un token.
- **Ne pas modifier le logo** (`design/assets/logos/`). Jamais recoloré, redessiné ni recréé.
- **Typographie et rayons inchangés** : Poppins (titres, boutons, chiffres clés) + Inter (texte, tableaux) ;
  rayons 10 (champs, boutons), 16 (cartes), 18 (modales, espace souscripteur), pill (badges).
- **Espacements** : 4 · 8 · 12 · 16 · 24 · 32 · 48 uniquement.
- **Couleurs de statut** (succès vert, danger rouge, warning orange, info bleu) : uniquement pour un état réel,
  jamais décoratives. Chaque badge porte un texte. Jamais d'information portée par la couleur seule.
  Libellés et statuts : `docs/specs/status-mapping.yaml`.
- **Thème par espace** via `data-theme` sur le conteneur de layout : `member` (souscripteur, corail),
  `manager` (gestionnaire, violet), `superadmin` (indigo). Les composants ne lisent que `--brand`, `--brand-dark`,
  `--brand-pale`, `--page` : aucun composant dupliqué par espace.
- **Jamais de fond blanc pur pour la page** : fond teinté de l'espace (`--page`), cartes blanches.
- **Montants** : `25 000 F` (espace fine insécable U+202F comme séparateur de milliers, pas de décimales),
  alignés à droite dans les tableaux. Toujours passer par `formatFCFA()` (qui délègue à `formatMoney` de `@cotiz/domain` à partir du lot 0.3).
- **Mobile** : cibles tactiles ≥ 44 px, action principale accessible au pouce.
- Pas de bibliothèque UI (Vuetify, PrimeVue, Nuxt UI…) ni de Tailwind : le design system est déjà en CSS.
- Nouveau composant « message prêt » (codes, relances) : `HandoffCard`, décrit dans `docs/specs/ui-deviations.md`.

## Stack et architecture

- Nuxt 4 (4.5), TypeScript strict, `<script setup lang="ts">`.
- Commandes : **depuis `frontend/`** (`npm run …`) jusqu'au lot 0.1, puis `pnpm --filter frontend <script>` depuis la racine.
  Scripts : `dev`, `build`, `typecheck`, `lint`, `lint:fix`, `test`, `capture`, `e2e`, `a11y`, `coherence`.
  Depuis `frontend/`, les références de la maquette sont sous `../design/`.
- Types d'API : `@cotiz/contracts` (réponses typées par `CallOutput<id, opération>` de `@cotiz/api-client`). `frontend/types/`
  (import via `~~/types`) ne garde que les types d'interface des écrans, produits par `composables/api/vues/*`.
- Styles du DS : copies **non modifiées** de `design/css/` dans `frontend/app/assets/css/` (seule exception : l'`@import`
  Google Fonts en tête de `bundle.css`, retiré au lot 0.1), plus `app.css` (reset léger, fond `var(--page)`).
  Polices : auto-hébergées via `@fontsource` (`css` de `nuxt.config`), aucun appel à un service tiers. Logos copiés dans
  `frontend/public/`.
- État global : Pinia uniquement si nécessaire (session, compteurs de navigation). Sinon composables.
- Styles spécifiques en `<style scoped>` qui **n'utilisent que des variables de tokens**.

```
app/
  assets/css/            cotiz-tokens.css, bundle.css, app.css
  components/
    cz/                  composants de base du DS : CzButton, CzInput, CzField, CzBadge, CzCard, CzModal, CzSheet, CzIcon…
    metier/              GrilleEcheances, SelecteurEcheances, CarteProjet, CarteKpi, VisionneusePreuve, Frise…
    layout/              PublicHeader, PublicFooter, BackofficeSidebar, BackofficeTopbar, MemberNav, ManagerMobileNav, ProjetHeader
  layouts/               public.vue, auth.vue, backoffice.vue (super-admin + gestionnaire), souscripteur.vue
  pages/                 une page par route de design/INVENTAIRE.md
  composables/api/       seul point d'accès aux données (client.ts : @cotiz/api-client ; un fichier par ressource ; vues/ : contrat → interface)
  utils/                 format.ts (formatFCFA, dates en français), icons.ts
  middleware/            espace-*.ts (contrôle du rôle de la session)
server/
  api/                   v1/** : handlers Nitro simulés, un par opération du contrat ; _dev/ : outils de développement
  mocks/                 jeu de référence + store en mémoire pour les mutations
  bascule/               real-endpoints.ts + proxy vers NestJS (lot 0.3)
types/                   types d'interface des écrans (Projet, Souscripteur, Echeance, Paiement…)
scripts/, tests/         capture d'écran, tests unitaires (dont conformité des mocks), parcours e2e, cohérence, accessibilité
```

## Données : mocks, contrat et bascule

- Le front n'importe **jamais** un mock directement : il passe par `composables/api/*`. Aucun `$fetch` hors de ce dossier.
- Contrat de référence : `docs/specs/endpoints.yaml` → `@cotiz/contracts` → `@cotiz/api-client` (lot 0.2).
  Aucun type d'API écrit à la main une fois le lot 0.3 fait. Mécanisme complet : `docs/architecture/10-front-integration.md`.
- Les handlers simulés gardent une latence courte (200–400 ms) pour que les états de chargement (squelettes) existent.
- Les mutations (valider un paiement, signer un contrat…) modifient un store en mémoire côté serveur.
- **Scénarios** : en dev, chaque handler accepte `?scenario=<état>` (propagé depuis l'URL de la page) pour forcer les
  états de données de l'inventaire (`file-vide`, `aucun-projet`, `tout-est-paye`…). Les états d'interface
  (modale ouverte, étape 3 d'un formulaire) s'obtiennent par interaction réelle.
- Données : **exactement** `docs/specs/seed-reference.yaml` / `design/DONNEES-REFERENCE.md`. Les placeholders (`[N]`, `[MONTANT]`,
  `[DATE]`, `[PRIX]`…, inventaire dans `docs/placeholders-v0.md`) restent tels quels : ne pas inventer de valeur.
- Bascule d'un endpoint vers NestJS : ajouter son id à `frontend/server/bascule/real-endpoints.ts` (commande `/bascule`),
  puis supprimer son handler simulé en fin de lot.
- Droits et fonctionnalités (à partir du lot 0.3) : `usePermissions()` et `<FeatureGate feature="…">` alimentés par `GET /me`.
  Le front masque, le back refuse.

## Session et routes

- V0 : `useSession()` — rôle `souscripteur | gestionnaire | superadmin | null` dans le cookie `cotiz_role`
  (le script de capture s'en sert pour ouvrir directement un espace protégé). Remplacé par l'authentification réelle au lot 1.1 ;
  garder un moyen équivalent pour le script de capture et les parcours e2e.
- Un middleware par espace redirige vers la bonne page de connexion.
- Préfixes : public (`/`, `/demande`, `/connexion…`, `/legal/…`), gestionnaire `/asso/**`, super-admin `/plateforme/**`,
  souscripteur (`/accueil`, `/projets/**`, `/paiements/**`, `/historique`, `/associations/**`, `/contrats`, `/notifications`,
  `/profil`, `/bienvenue`). Tableau de bord souscripteur : **`/accueil`** (la spec dit `/`, pris par la landing).
- Responsive : **une seule page par route**, adaptée par breakpoints (mobile < 768 px, tablette < 1024 px).
  Les captures `web` et `mobile` sont deux rendus de la même page. Pas de pages `-mobile`.
  - Back-office : barre latérale 240 px (repliée 72 px en tablette) ; en mobile, gestionnaire = navigation basse
    5 entrées (Accueil, Projets, Paiements, Membres, Plus) comme dans les captures.
  - Souscripteur : navigation basse 4 entrées + bouton flottant « Déclarer un paiement » ; en desktop, barre latérale
    et contenu centré sur 960 px.
  - Modales desktop → feuilles basses (bottom sheets) en mobile, comme dans les captures.

## Méthode de travail (écrans)

- **Réutiliser** les composants existants avant d'en créer. Un nouveau composant générique va dans `components/cz/`
  ou `components/metier/`, pas dans une page.
- Après chaque écran touché : `/verifier-ecran <route> [--role …] [--scenario …]` (capture dans `frontend/.verif/`,
  comparée à `design/screens/`). Corriger les écarts avant de passer au suivant.
- Typecheck et lint doivent passer à la fin de chaque étape.
- Ne jamais toucher à `design/` (lecture seule).

## Définition de « terminé » pour un écran

- [ ] Route conforme à l'inventaire, accessible depuis la navigation réelle.
- [ ] Rendu fidèle aux captures web ET mobile, pour chaque état listé.
- [ ] États vide / chargement (squelettes) / erreur présents quand l'écran charge des données.
- [ ] Liens et boutons câblés vers les vraies routes (plus aucun `href="#"`).
- [ ] Uniquement des tokens et des classes du DS ; aucune couleur inventée.
- [ ] Montants via `formatFCFA`, vocabulaire respecté, cibles tactiles ≥ 44 px.
- [ ] Données issues de `composables/api`, identiques aux données de référence.
