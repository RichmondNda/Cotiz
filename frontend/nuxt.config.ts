// https://nuxt.com/docs/api/configuration/nuxt-config
import { ROUTES_NAVIGATEUR } from './server/bascule/routes-navigateur'

export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],

  // Composants auto-importés par leur nom de fichier (CzButton, GrilleEcheances, PublicHeader…),
  // sans préfixe de dossier.
  components: [{ path: '~/components', pathPrefix: false }],
  // Composables d'accès aux données (useProjets, usePaiement…) : un fichier par ressource.
  imports: { dirs: ['composables/api'] },
  devtools: { enabled: true },

  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'Cotiz',
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/cotiz-mark.svg' },
      ],
    },
  },

  // Polices auto-hébergées (@fontsource, aucun appel à un service tiers) : mêmes graisses que la maquette.
  // Puis le design system Cotiz : fichiers copiés tels quels depuis design/css (sauf l'@import Google Fonts
  // de bundle.css, retiré), puis surcouche applicative.
  css: [
    '@fontsource/poppins/400.css',
    '@fontsource/poppins/500.css',
    '@fontsource/poppins/600.css',
    '@fontsource/poppins/700.css',
    '@fontsource/inter/400.css',
    '@fontsource/inter/500.css',
    '@fontsource/inter/600.css',
    '~/assets/css/cotiz-tokens.css',
    '~/assets/css/bundle.css',
    '~/assets/css/app.css',
  ],
  runtimeConfig: {
    // Bascule mock → NestJS (server/middleware/bascule.ts) : NUXT_MOCKS=0 transmet tout `/api/v1` à NUXT_API_ORIGIN.
    mocks: true,
    apiOrigin: 'http://localhost:4000',
    // Origine publique du stockage (NUXT_STORAGE_ORIGIN) : le navigateur y suit l'URL signée d'une preuve (fl.get) ;
    // autorisée dans la politique de contenu (server/plugins/securite.ts). Même valeur que S3_PUBLIC_ENDPOINT du back.
    storageOrigin: 'http://localhost:9000',
    public: {
      // GlitchTip (lot 0.6) : vide = inactif, raccordé au lot 7.1 (NUXT_PUBLIC_GLITCHTIP_DSN, NUXT_PUBLIC_APP_VERSION).
      glitchtipDsn: '',
      appVersion: 'dev',
    },
  },

  // Espaces basculés : rendus dans le navigateur (server/bascule/routes-navigateur.ts).
  routeRules: Object.fromEntries(ROUTES_NAVIGATEUR.map(route => [route, { ssr: false }])),
  compatibilityDate: '2025-07-15',

  // Build sans mocks (NUXT_MOCKS=0 au build : production, recette) : handlers simulés et outils de dev exclus.
  nitro: {
    ignore: process.env.NUXT_MOCKS === '0' ? ['api/v1/**', 'api/_dev/**'] : [],
  },

  // Dépendances découvertes en cours de route (imports dynamiques, dont le solveur ALTCHA) : pré-optimisées au
  // démarrage du serveur de dev, sinon Vite recharge la page au premier passage (parcours e2e en CI).
  vite: {
    // Build avec handlers simulés (fixé au build, comme nitro.ignore) : sans eux, seuls les endpoints du registre de
    // bascule existent et les fonctionnalités sont celles de `GET /me` (utils/bascule.ts, AVEC_MOCKS).
    define: { __COTIZ_MOCKS__: JSON.stringify(process.env.NUXT_MOCKS !== '0') },
    optimizeDeps: { include: ['@sentry/vue', 'zod', 'markdown-it', 'altcha/lib', 'qrcode'] },
  },

  typescript: {
    strict: true,
    // Types de domaine partagés entre app/ et server/ (frontend/types).
    tsConfig: { include: ['../types/**/*'] },
    nodeTsConfig: { include: ['../types/**/*'] },
  },

  eslint: {
    config: { stylistic: true },
  },
})
