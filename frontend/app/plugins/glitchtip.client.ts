// Rapports d'erreurs (GlitchTip) : inactif sans NUXT_PUBLIC_GLITCHTIP_DSN, le SDK n'est alors jamais téléchargé.
export default defineNuxtPlugin((nuxtApp) => {
  const { glitchtipDsn, appVersion } = useRuntimeConfig().public
  void demarrerGlitchtip({
    dsn: String(glitchtipDsn ?? ''),
    version: String(appVersion ?? 'dev'),
    app: nuxtApp.vueApp,
    charger: () => import('@sentry/vue'),
  })
})
