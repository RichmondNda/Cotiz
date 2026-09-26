// POST /api/mot-de-passe/code — envoie un code de réinitialisation (SMS ou email). Ne révèle pas si le compte existe.
import type { EnvoiCode, ProfilMotDePasse } from '~~/types'
import { chiffresTelephone } from '../../mocks/auth'

export default defineMockHandler(async (event): Promise<EnvoiCode> => {
  const corps = await readBody<{ profil?: ProfilMotDePasse, identifiant?: string }>(event) ?? {}
  const identifiant = String(corps.identifiant ?? '').trim()
  if (corps.profil === 'souscripteur') {
    const c = chiffresTelephone(identifiant)
    if (c.length !== 10) throw createError({ statusCode: 400, statusMessage: 'Numero a 10 chiffres attendu' })
    return { destination: `+225 ${c.replace(/(\d{2})(?=\d)/g, '$1 ')}`, delaiRenvoi: 60 }
  }
  if (corps.profil === 'gestionnaire') {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifiant)) throw createError({ statusCode: 400, statusMessage: 'Adresse email invalide' })
    return { destination: identifiant, delaiRenvoi: 60 }
  }
  throw createError({ statusCode: 400, statusMessage: 'Profil inconnu' })
})
