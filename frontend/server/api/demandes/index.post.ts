// POST /api/demandes — demande de création d'association (formulaire public /demande).
// Ajoute la demande au store (statut « À traiter ») ; la référence reste le placeholder de la maquette.
import type { Demande, DemandeCreee, NouvelleDemande } from '~~/types'
import { DATE_REFERENCE } from '../../../app/utils/date-reference'
import { store } from '../../mocks/store'
import { chiffresTelephone } from '../../mocks/auth'

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function slug(t: string) {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default defineMockHandler(async (event): Promise<DemandeCreee> => {
  const d = await readBody<NouvelleDemande>(event)
  const a = d?.association
  const r = d?.responsable
  const b = d?.besoins
  const valide = a?.nom?.trim() && a.type && a.ville?.trim() && a.pays && a.description?.trim() && a.description.length <= 500
    && r?.prenom?.trim() && r.nom?.trim() && r.fonction?.trim() && EMAIL.test(r.email ?? '') && chiffresTelephone(r.telephone ?? '').length === 10
    && b?.souscripteursEstimes && store.plans.some(p => p.id === b.planSouhaiteId)
    && d.cguAcceptees === true
  if (!valide) throw createError({ statusCode: 400, statusMessage: 'Demande incomplete' })

  let id = slug(a.nom) || 'demande'
  while (store.demandes.some(x => x.id === id)) id += '-1'
  const demande: Demande = {
    id,
    reference: '[RÉF. DE LA DEMANDE]',
    recueLe: DATE_REFERENCE.slice(0, 10),
    statut: 'a_traiter',
    association: a,
    responsable: r,
    besoins: b,
    cguAcceptees: true,
  }
  store.demandes.push(demande)
  return { id, reference: demande.reference, email: r.email }
})
