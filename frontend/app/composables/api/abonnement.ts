// Abonnement de l'association (bl.sub, bl.inv).
import type { AbonnementAssociation, StatutFactureAbonnement } from '~~/types'
import { maintenant } from '~/utils/date-reference'
import { formatMois, joursDepuis } from '~/utils/format'
import { associationCourante } from './session'
import { jour, m } from './vues/communs'

const FACTURE: Record<string, StatutFactureAbonnement> = { draft: 'a_payer', open: 'a_payer', paid: 'payee', overdue: 'impayee', void: 'payee' }
/** Une facture à régler dans les 7 jours met l'abonnement « à échéance proche ». */
const JOURS_ECHEANCE_PROCHE = 7

/** « Demander un changement » déjà fait pendant la session (pas d'endpoint : la plateforme change le plan, pf.asso.plan). */
const useChangementDemande = () => useState('changement-formule-demande', () => false)

/** Formule, utilisation et factures de l'association (MgAbonnement). */
export const useAbonnement = () => {
  const demande = useChangementDemande()
  return useLecture<AbonnementAssociation>('abonnement', async (client) => {
    const aid = await associationCourante(client)
    const [s, factures] = await Promise.all([
      client.call('bl.sub', 'get', { params: { aid } }),
      client.call('bl.inv', 'list', { params: { aid }, query: { limit: 100 } }),
    ])
    const quota = (q: { used: number, limit: number | null }) => ({ utilise: q.used, limite: q.limit, pourcentage: q.limit ? Math.min(100, Math.round(q.used / q.limit * 100)) : 0 })
    const due = factures.items.find(f => f.status === 'overdue') ?? factures.items.find(f => f.status === 'open' && f.dueAt && -joursDepuis(jour(f.dueAt), maintenant()) <= JOURS_ECHEANCE_PROCHE)
    const statut = s.status === 'suspended' ? 'suspendu' : due ? 'echeance_proche' : 'actif'
    return {
      planId: s.plan.id, nomPlan: s.plan.name, prixAnnuel: m(s.plan.priceYearly), statut,
      clientDepuis: '[DATE]', prochaineFacture: s.currentPeriodEnd ?? '[DATE]', moyenPaiement: 'Virement ou mobile money à Cotiz',
      utilisation: { projets: quota(s.quotas.projects), souscripteurs: quota(s.quotas.subscribers), gestionnaires: quota(s.quotas.managers) },
      factures: factures.items.filter(f => f.status !== 'draft').map(f => ({
        id: f.id, numero: f.number, periode: formatMois(f.periodStart), emiseLe: f.issuedAt ? jour(f.issuedAt) : '[DATE]', montant: m(f.amount), statut: FACTURE[f.status] ?? 'a_payer',
      })),
      ...(statut !== 'actif' && due ? { factureDue: { numero: due.number, echeance: jour(due.dueAt ?? due.periodEnd) } } : {}),
      emailContactCotiz: '[ADRESSE EMAIL DE CONTACT]',
      changementDemande: demande.value,
    }
  })
}

/** « Demander un changement » de formule : l'équipe Cotiz recontacte l'association (aucun envoi automatique). */
export function useDemandeChangementFormule() {
  const demande = useChangementDemande()
  return async () => {
    demande.value = true
    return { ok: true }
  }
}
