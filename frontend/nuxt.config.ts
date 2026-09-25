// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
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
