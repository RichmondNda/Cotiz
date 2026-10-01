// https://nuxt.com/docs/api/configuration/nuxt-config
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
    public: {
      // Base des appels d'API. V0 : handlers Nitro locaux (mocks). Brancher NestJS = changer cette valeur
      // (NUXT_PUBLIC_API_BASE).
      apiBase: '/api',
    },
  },
  compatibilityDate: '2025-07-15',

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
