// Espaces basculés vers le vrai back (plateforme au lot 1.1, gestionnaire et souscripteur au lot 1.2) : rendus dans
// le navigateur (`routeRules` de nuxt.config). Le jeton d'accès vit en mémoire et le cookie de renouvellement est limité
// à /api/v1/auth : au rendu serveur, aucune identité, et la garde d'espace (app/utils/garde-espace.ts) ne contrôle rien.
// Toute page gardée doit donc figurer ici (tests/unit/routes-navigateur.test.ts). Préfixes de frontend/CLAUDE.md.
export const ROUTES_NAVIGATEUR = [
  '/plateforme', '/plateforme/**', '/asso', '/asso/**',
  '/accueil', '/projets/**', '/paiements/**', '/historique', '/associations', '/associations/**', '/contrats',
  '/notifications', '/profil', '/bienvenue',
  '/_dev/gabarit-souscripteur', '/_dev/gabarit-gestionnaire', '/_dev/gabarit-plateforme', '/_dev/donnees',
]
