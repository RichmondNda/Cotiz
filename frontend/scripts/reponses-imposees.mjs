// Réponses imposées aux appels d'authentification, pour capturer un état d'erreur des écrans de connexion sans le
// provoquer sur le vrai back (lot 1.2) : cinq échecs bloqueraient le compte de développement 15 min, et certains états
// (association suspendue, compte non activé, code expiré) n'existent pas sur les comptes de seed-dev. Les parcours e2e,
// eux, passent par le vrai back.

const TITRES = {
  invalid_credentials: 'Identifiant ou mot de passe incorrect.',
  account_locked: 'Compte bloqué pendant 15 minutes après plusieurs tentatives.',
  association_suspended: 'L’espace de votre association est suspendu. Contactez l’équipe Cotiz.',
  account_not_activated: 'Votre compte n’est pas encore activé. Utilisez le code remis par votre association.',
  invalid_code: 'Code incorrect.',
  code_expired: 'Ce code a expiré. Demandez-en un nouveau à votre association.',
}
const STATUTS = {
  invalid_credentials: 401, account_locked: 423, association_suspended: 403, account_not_activated: 403,
  invalid_code: 422, code_expired: 422,
}

/** L'appel `chemin` (glob Playwright) répond par le Problem `code` (docs/specs/errors.yaml), une fois. */
export function imposerProbleme(page, chemin, code) {
  const status = STATUTS[code]
  return page.route(chemin, route => route.fulfill({
    status,
    contentType: 'application/problem+json',
    body: JSON.stringify({ type: 'about:blank', title: TITRES[code], status, code }),
  }), { times: 1 })
}

/** L'appel `chemin` répond par `corps` (JSON) avec le statut `status`, une fois. */
export function imposerReponse(page, chemin, corps, status = 200) {
  return page.route(chemin, route => route.fulfill(
    corps === null ? { status } : { status, contentType: 'application/json', body: JSON.stringify(corps) },
  ), { times: 1 })
}
