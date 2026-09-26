// Pages de démonstration (/_dev/**) : disponibles en développement uniquement.
export default defineNuxtRouteMiddleware(() => {
  if (!import.meta.dev) {
    return abortNavigation(createError({ statusCode: 404, statusMessage: 'Page introuvable' }))
  }
})
