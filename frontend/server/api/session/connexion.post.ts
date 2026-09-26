// POST /api/session/connexion — connexion mockée des trois espaces (identifiants : server/mocks/IDENTIFIANTS.md).
// Erreurs : 401 `numero-inconnu` · `mot-de-passe-incorrect` · `identifiants-incorrects`, 403 `compte-suspendu`, 423 `blocage`.
import type { DemandeConnexion, ResultatConnexion } from '~~/types'
import {
  EMAIL_SUPERADMIN, MOT_DE_PASSE, MOT_DE_PASSE_PROVISOIRE, MOT_DE_PASSE_SUSPENDU,
  effacerEchecs, enregistrerEchec, estBloque, gestionnaireParEmail, souscripteurParTelephone,
} from '../../mocks/auth'

export default defineMockHandler(async (event): Promise<ResultatConnexion> => {
  const corps = await readBody<Partial<DemandeConnexion>>(event)
  const identifiant = String(corps?.identifiant ?? '').trim()
  const motDePasse = String(corps?.motDePasse ?? '')

  switch (corps?.espace) {
    case 'souscripteur': {
      const s = souscripteurParTelephone(identifiant)
      if (!s) erreurMetier(401, 'numero-inconnu', 'Numero inconnu')
      if (motDePasse === MOT_DE_PASSE_PROVISOIRE) return { etape: 'premiere-connexion', role: 'souscripteur', prenom: s.prenom }
      if (motDePasse !== MOT_DE_PASSE) erreurMetier(401, 'mot-de-passe-incorrect', 'Mot de passe incorrect')
      return { etape: 'connecte', role: 'souscripteur' }
    }
    case 'gestionnaire': {
      const cle = `gestionnaire:${identifiant.toLowerCase()}`
      if (estBloque(cle)) erreurMetier(423, 'blocage', 'Trop de tentatives')
      const g = gestionnaireParEmail(identifiant)
      if (g && motDePasse === MOT_DE_PASSE_SUSPENDU) erreurMetier(403, 'compte-suspendu', 'Espace suspendu')
      if (!g || motDePasse !== MOT_DE_PASSE) {
        if (enregistrerEchec(cle)) erreurMetier(423, 'blocage', 'Trop de tentatives')
        erreurMetier(401, 'identifiants-incorrects', 'Identifiants incorrects')
      }
      effacerEchecs(cle)
      return { etape: 'connecte', role: 'gestionnaire' }
    }
    case 'superadmin': {
      if (identifiant.toLowerCase() !== EMAIL_SUPERADMIN || motDePasse !== MOT_DE_PASSE) {
        erreurMetier(401, 'identifiants-incorrects', 'Identifiants incorrects')
      }
      return { etape: 'code-requis', role: 'superadmin' }
    }
    default:
      throw createError({ statusCode: 400, statusMessage: 'Espace de connexion inconnu' })
  }
})
