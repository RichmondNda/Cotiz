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
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Inter:wght@400;500;600&display=swap',
        },
      ],
    },
  },

  // Design system Cotiz : fichiers copiés tels quels depuis design/css, puis surcouche applicative.
  css: ['~/assets/css/cotiz-tokens.css', '~/assets/css/bundle.css', '~/assets/css/app.css'],
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
