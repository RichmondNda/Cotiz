// POST /api/paiements/:id/validation — le gestionnaire valide un paiement déclaré :
// échéances couvertes créditées (payées ou partielles), souscription et compteurs du projet recalculés.
import { maintenant } from '../../../../app/utils/date-reference'
import { store } from '../../../mocks/store'

export default defineMockHandler((event) => {
  const moi = utilisateurSession(event)
  if (moi?.role !== 'gestionnaire') throw createError({ statusCode: 403, statusMessage: 'Reserve aux gestionnaires' })
  const p = store.paiements.find(x => x.id === parametre(event, 'id')) ?? introuvable('Paiement')
  if (p.statut !== 'en_attente') erreurMetier(409, 'deja_traite', 'Paiement deja traite')

  for (const r of p.repartition) {
    const e = store.echeances.find(x => x.id === r.echeanceId)
    if (!e) continue
    e.montantPaye = Math.min(e.montant, e.montantPaye + r.montantAffecte)
    e.statut = e.montantPaye >= e.montant ? 'payee' : 'partielle'
  }
  Object.assign(p, { statut: 'valide', traiteLe: maintenant().toISOString(), traitePar: moi.id })

  const souscription = store.souscriptions.find(s => s.projetId === p.projetId && s.souscripteurId === p.souscripteurId)
  if (souscription) actualiserSouscriptionProjet(souscription)
  const projet = store.projets.find(x => x.id === p.projetId)
  if (projet) {
    projet.nbPaiementsAValider = Math.max(0, projet.nbPaiementsAValider - 1)
    if (typeof projet.montantCollecte === 'number') projet.montantCollecte += p.montantRecu ?? p.montant
  }
  return p
})
