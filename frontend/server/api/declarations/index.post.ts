// POST /api/declarations — le souscripteur déclare un paiement (montant, échéances couvertes, preuve).
// Le paiement est créé « En attente » ; les échéances couvertes passent « Déclarée » jusqu'à la validation.
import type { NouvelleDeclaration, Paiement } from '~~/types'
import { DATE_REFERENCE } from '../../../app/utils/date-reference'
import { store } from '../../mocks/store'

export default defineMockHandler(async (event): Promise<Paiement> => {
  const moi = souscripteurSession(event)
  const corps = await readBody<NouvelleDeclaration>(event)
  const souscription = store.souscriptions.find(s => s.projetId === corps?.projetId && s.souscripteurId === moi.id)
    ?? introuvable('Projet')
  if (!souscription.contratSigneLe) erreurMetier(409, 'contrat-a-signer', 'Contract must be signed first')
  if (!Number.isInteger(corps.montant) || corps.montant <= 0) erreurMetier(422, 'montant-invalide', 'Invalid amount')
  if (corps.montant > souscription.reste) erreurMetier(422, 'montant-trop-eleve', 'Amount exceeds remaining balance')
  const reparti = corps.repartition.reduce((t, r) => t + r.montantAffecte, 0)
  if (reparti !== corps.montant) erreurMetier(422, 'repartition-invalide', 'Allocation does not match amount')
  if (corps.preuve.type === 'reference' && !corps.preuve.reference.trim()) erreurMetier(422, 'preuve-manquante', 'Proof required')

  const projet = store.projets.find(p => p.id === corps.projetId)!
  const paiement: Paiement = {
    id: `pm-${Date.now().toString(36)}`,
    souscripteurId: moi.id,
    projetId: projet.id,
    associationId: projet.associationId,
    montant: corps.montant,
    moyen: corps.moyen,
    dateVirement: corps.dateVirement,
    declareLe: DATE_REFERENCE,
    preuve: corps.preuve,
    ...(corps.commentaire?.trim() ? { commentaire: corps.commentaire.trim() } : {}),
    repartition: corps.repartition,
    repartitionAjustee: false,
    statut: 'en_attente',
  }
  store.paiements.unshift(paiement)

  const echeances = store.echeances.filter(e => e.projetId === projet.id && e.souscripteurId === moi.id)
  for (const r of corps.repartition) {
    const e = echeances.find(x => x.id === r.echeanceId)
    if (e && r.montantAffecte > 0) e.statut = 'declaree'
  }
  recalculerSouscription(souscription, echeances)
  return paiement
})
