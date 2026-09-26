// GET /api/moi/souscriptions/:projetId — détail d'un projet vu par le souscripteur : situation, échéancier,
// paiements déclarés, contrat. Scénarios (MbProjet) : `a-jour`, `paiement-en-attente`, `paiement-rejete`, `termine`.
import type { DetailSouscriptionMembre } from '~~/types'
import { store } from '../../../mocks/store'

export default defineMockHandler((event, scenario): DetailSouscriptionMembre => {
  const moi = souscripteurSession(event)
  const projetId = parametre(event, 'projetId')
  const d = donneesMembre(moi.id, scenario)
  const s = souscriptionsMembre(d).find(x => x.projetId === projetId) ?? introuvable('Projet')
  const contrat = store.contrats.find(c => c.projetId === projetId && c.souscripteurId === moi.id)
  return {
    ...s,
    echeances: d.echeances.filter(e => e.projetId === projetId).sort((a, b) => a.rang - b.rang),
    paiements: d.paiements.filter(p => p.projetId === projetId),
    ...(contrat ? { contrat } : {}),
  }
})
