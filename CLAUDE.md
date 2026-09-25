# Cotiz — front-end NuxtJS (V0)

Cotiz est un SaaS de gestion des cotisations d'associations (Afrique de l'Ouest francophone, montants en F CFA).
Les paiements ne transitent PAS par la plateforme : le souscripteur vire l'argent à l'association, puis **déclare**
son paiement avec une preuve ; le gestionnaire vérifie et **valide**. Un paiement peut couvrir plusieurs échéances.

Objectif de la V0 : **tout le front, tous les écrans, avec des données mockées**, avant de brancher le back-end NestJS.

## Sources de vérité (dans cet ordre)

1. `design/screens/**` — captures de la maquette validée (1440 px et 390 px), une par état. C'est ce qu'on doit obtenir.
2. `design/html/**` — le HTML rendu de chaque capture : structure, classes `cz-*`, textes exacts.
3. `design/css/cotiz-tokens.css` + `design/css/bundle.css` — tokens et classes du design system (à utiliser tels quels).
4. `design/specs/cotiz-spec-ui.html` — spécification fonctionnelle : objectif, zones, interactions, états de chaque écran.
5. `design/source-maquette/*.dc.html` — code source de la maquette. Utile pour la **logique** (quel clic mène où, quel état
   s'affiche quand). Format de templating propriétaire : ne pas copier sa syntaxe (`{{ }}`, `<sc-if>`, `<sc-for>`).
6. `design/design-system/` — documentation du design system (règles, composants, icônes, logo).

`design/INVENTAIRE.md` liste chaque écran → route → états → fichiers. `design/DONNEES-REFERENCE.md` donne les données mockées.

En cas de conflit entre la capture et la spec : **la capture gagne**, et tu le signales dans ton compte rendu.

## Règles de design (non négociables)

- **Aucune nouvelle couleur.** Uniquement les variables de `cotiz-tokens.css` (`var(--brand)`, `var(--success)`…).
  Pas de valeur hexadécimale en dur dans les composants, sauf si elle est déjà dans le HTML de référence et correspond à un token.
- **Ne pas modifier le logo** (`design/assets/logos/`). Jamais recoloré, redessiné ni recréé.
- **Typographie et rayons inchangés** : Poppins (titres, boutons, chiffres clés) + Inter (texte, tableaux) ;
  rayons 10 (champs, boutons), 16 (cartes), 18 (modales, espace souscripteur), pill (badges).
- **Espacements** : 4 · 8 · 12 · 16 · 24 · 32 · 48 uniquement.
- **Couleurs de statut** (succès vert, danger rouge, warning orange, info bleu) : uniquement pour un état réel,
  jamais décoratives. Chaque badge porte un texte. Jamais d'information portée par la couleur seule.
- **Thème par espace** via `data-theme` sur le conteneur de layout : `member` (souscripteur, corail),
  `manager` (gestionnaire, violet), `superadmin` (indigo). Les composants ne lisent que `--brand`, `--brand-dark`,
  `--brand-pale`, `--page` : aucun composant dupliqué par espace.
- **Jamais de fond blanc pur pour la page** : fond teinté de l'espace (`--page`), cartes blanches.
- **Montants** : `25 000 F` (espace fine insécable U+202F comme séparateur de milliers, pas de décimales),
  alignés à droite dans les tableaux. Toujours passer par `formatFCFA()`.
- **Vocabulaire** : projet, souscripteur, échéance, fonds d'entrée, déclarer un paiement, valider.
  Jamais : campagne, client, adhérent, mensualité, facture (pour une échéance), payer, approuver, encaisser.
- **Mobile** : cibles tactiles ≥ 44 px, action principale accessible au pouce.
- Pas de bibliothèque UI (Vuetify, PrimeVue, Nuxt UI…) ni de Tailwind : le design system est déjà en CSS.

## Stack et architecture

- Nuxt 4 (4.5), TypeScript strict, `<script setup lang="ts">`.
- **L'app Nuxt vit dans `frontend/`** ; `design/`, `prompts/`, `.claude/` et ce fichier restent à la racine du repo.
  Toutes les commandes npm, le script de capture et `.verif/` s'utilisent **depuis `frontend/`** ; depuis là, les
  références de la maquette sont sous `../design/`.
- Scripts npm (`frontend/package.json`) : `dev`, `build`, `typecheck`, `lint`, `lint:fix`, `capture`.
- Types de domaine : `frontend/types/` (import via `~~/types`), inclus dans le typecheck de l'app et du serveur.
- Styles du DS : copies **non modifiées** de `design/css/` dans `frontend/app/assets/css/`, plus `app.css`
  (reset léger, fond `var(--page)`). Polices chargées dans `nuxt.config` (`app.head`). Logos copiés dans `frontend/public/`.
- État global : Pinia uniquement si nécessaire (session mockée, compteurs de navigation). Sinon composables.
- Styles : `bundle.css` et `cotiz-tokens.css` chargés globalement ; styles spécifiques en `<style scoped>` qui
  **n'utilisent que des variables de tokens**.

Arborescence cible (adapter aux conventions déjà en place dans le repo si elles existent) :

```
app/
  assets/css/            cotiz-tokens.css, bundle.css, app.css (polices, reset léger)
  components/
    cz/                  composants de base du DS : CzButton, CzInput, CzField, CzBadge, CzCard, CzModal, CzSheet, CzIcon…
    metier/              GrilleEcheances, SelecteurEcheances, CarteProjet, CarteKpi, VisionneusePreuve, Frise…
    layout/              PublicHeader, PublicFooter, BackofficeSidebar, BackofficeTopbar, MemberNav, ManagerMobileNav, ProjetHeader
  layouts/               public.vue, auth.vue, backoffice.vue (super-admin + gestionnaire), souscripteur.vue
  pages/                 une page par route de design/INVENTAIRE.md
  composables/api/       useProjets(), usePaiements()… : seul point d'accès aux données
  utils/                 format.ts (formatFCFA, dates en français), icons.ts
  middleware/            espace-*.ts (contrôle du rôle de la session mockée)
server/
  api/                   handlers Nitro qui servent les mocks (même forme que la future API NestJS)
  mocks/                 données de référence typées + petit store en mémoire pour les mutations
types/                   types partagés (Projet, Souscripteur, Echeance, Paiement…)
```

### Données mockées

- Le front n'importe **jamais** un mock directement : il passe par `composables/api/*` → `$fetch('/api/...')`.
  Brancher NestJS plus tard = changer la base URL (runtimeConfig), rien d'autre.
- Les handlers `server/api` simulent une latence courte (200–400 ms) pour que les états de chargement (squelettes) existent.
- Les mutations (valider un paiement, signer un contrat…) modifient un store en mémoire côté serveur.
- **Scénarios** : en dev, chaque handler accepte `?scenario=<état>` (propagé depuis l'URL de la page) pour forcer les
  états de données de l'inventaire (`file-vide`, `aucun-projet`, `tout-est-paye`…). Les états d'interface
  (modale ouverte, étape 3 d'un formulaire) s'obtiennent par interaction réelle.
- Utiliser **exactement** les données de `design/DONNEES-REFERENCE.md`. Les placeholders de la maquette (`[N]`, `[MONTANT]`,
  `[DATE]`, `[PRIX]`…) restent tels quels dans les mocks : ne pas inventer de valeur.

### Session mockée et routes

- `useSession()` : rôle `souscripteur | gestionnaire | superadmin | null`, stocké dans le cookie `cotiz_role`
  (le script de capture s'en sert pour ouvrir directement un espace protégé).
  Les pages de connexion posent le rôle ; un middleware par espace redirige vers la bonne page de connexion.
- Préfixes : public (`/`, `/demande`, `/connexion…`, `/legal/…`), gestionnaire `/asso/**`, super-admin `/plateforme/**`,
  souscripteur (`/accueil`, `/projets/**`, `/paiements/**`, `/historique`, `/associations/**`, `/contrats`, `/notifications`,
  `/profil`, `/bienvenue`).
- ⚠ La spec place le tableau de bord souscripteur sur `/`, déjà pris par la landing. En V0 : **`/accueil`**.
- Responsive : **une seule page par route**, adaptée par breakpoints (mobile < 768 px, tablette < 1024 px).
  Les captures `web` et `mobile` sont deux rendus de la même page. Pas de pages `-mobile`.
  - Back-office : barre latérale 240 px (repliée 72 px en tablette) ; en mobile, gestionnaire = navigation basse
    5 entrées (Accueil, Projets, Paiements, Membres, Plus) comme dans les captures.
  - Souscripteur : navigation basse 4 entrées + bouton flottant « Déclarer un paiement » ; en desktop, barre latérale
    et contenu centré sur 960 px.
  - Modales desktop → feuilles basses (bottom sheets) en mobile, comme dans les captures.

## Méthode de travail

- On travaille **par lot** (`prompts/`). Un lot = une session. Ne pas déborder sur le lot suivant.
- Avant de coder un lot : lire les captures et le HTML de référence de chaque écran du lot, puis proposer un plan court.
- **Réutiliser** les composants existants avant d'en créer. Un nouveau composant générique va dans `components/cz/`
  ou `components/metier/`, pas dans une page.
- Après chaque écran, depuis `frontend/` : `node scripts/capture-ecran.mjs <route> [--role …] [--scenario …]`
  (serveur `npm run dev` lancé ; sortie dans `frontend/.verif/`), puis comparer
  (lire les deux images) avec la capture de référence de chaque état. Corriger les écarts avant de passer au suivant.
- `npm run typecheck` et `npm run lint` (depuis `frontend/`) doivent passer à la fin du lot.
- Ne jamais toucher à `design/` (lecture seule).
- Si une information manque ou si une règle ci-dessus bloque : **demander**, ne pas inventer.

## Définition de « terminé » pour un écran

- [ ] Route conforme à l'inventaire, accessible depuis la navigation réelle.
- [ ] Rendu fidèle aux captures web ET mobile, pour chaque état listé.
- [ ] États vide / chargement (squelettes) / erreur présents quand l'écran charge des données.
- [ ] Liens et boutons câblés vers les vraies routes (plus aucun `href="#"`).
- [ ] Uniquement des tokens et des classes du DS ; aucune couleur inventée.
- [ ] Montants via `formatFCFA`, vocabulaire respecté, cibles tactiles ≥ 44 px.
- [ ] Données issues de `composables/api`, identiques aux données de référence.
