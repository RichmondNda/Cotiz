// Demandes de création d'association : formulaire public (pub.request), traitement par la plateforme (pf.req.*).
import type { ApiClient } from './client'
import type { ApprobationDemande, Demande, DemandeCreee, DemandeDetaillee, NouvelleDemande, RefusDemande } from '~~/types'
import { STATUT_DEMANDE_INVERSE } from './vues/communs'
import { MOTIFS_REFUS, versDemande, vueDemande, vueDemandeDetaillee } from './vues/demandes'

/** Demandes de création (super-admin), plus anciennes d'abord. */
export const useDemandes = (filtres: MaybeRefOrGetter<{ statut?: string }> = {}) =>
  useLecture<Demande[]>(() => `demandes:${JSON.stringify(toValue(filtres))}`, async (client) => {
    const statut = toValue(filtres).statut
    const { items } = await toutesLesPages(cursor => client.call('pf.req.list', 'list', {
      query: { limit: 100, cursor, status: statut ? STATUT_DEMANDE_INVERSE[statut as keyof typeof STATUT_DEMANDE_INVERSE] as 'pending' : undefined },
    }))
    return items.map(vueDemande)
  })

/** Détail : plan et comptes attribués lus sur l'association créée à l'approbation. */
async function detail(client: ApiClient, id: string): Promise<DemandeDetaillee> {
  const d = await client.call('pf.req.get', 'get', { params: { id } })
  let attribution: { planId: string, planNom: string, comptes: number | null } | undefined
  if (d.decision?.associationId) {
    const a = await client.call('pf.asso.get', 'get', { params: { id: d.decision.associationId } }).catch(() => null)
    if (a) attribution = { planId: a.plan.id, planNom: a.plan.name, comptes: a.subscription.managerSeatsOverride }
  }
  if (!attribution && d.status === 'approved' && d.desiredPlan) attribution = { planId: d.desiredPlan.id, planNom: d.desiredPlan.name, comptes: 2 }
  return vueDemandeDetaillee(d, attribution)
}

export const useDemande = (id: MaybeRefOrGetter<string>) =>
  useLecture<DemandeDetaillee>(() => `demande:${toValue(id)}`, client => detail(client, toValue(id)))

/** Décision sur une demande : approbation (crée l'espace de l'association) ou refus motivé. */
export function useDecisionDemande() {
  const client = useClient()
  // Une décision retire la demande de « À traiter » : le badge « Demandes » du menu doit suivre.
  const { refresh: rechargerCompteurs } = useCompteursNavigation()
  return {
    approuver: async (id: string, a: ApprobationDemande) => {
      await client.call('pf.req.approve', 'approve', { params: { id }, body: {
        planId: a.planId, managerSeats: a.comptesGestionnaires, subscriptionStartsOn: a.debutAbonnement,
        internalNote: a.noteInterne || undefined, personalMessage: a.messagePersonnalise || undefined,
      } })
      await rechargerCompteurs()
      return detail(client, id)
    },
    refuser: async (id: string, r: RefusDemande) => {
      await client.call('pf.req.reject', 'reject', { params: { id }, body: { reasonCode: MOTIFS_REFUS[r.motif] ?? 'other', message: r.precisions || undefined } })
      await rechargerCompteurs()
      return detail(client, id)
    },
  }
}

/** Dernière demande envoyée depuis ce navigateur (affichée par /demande/confirmation, perdue au rechargement). */
export const useDemandeEnvoyee = () => useState<DemandeCreee | null>('demande-envoyee', () => null)

/** Formulaire public `/demande` : `const envoyer = useEnvoiDemande()` dans `setup`. */
export function useEnvoiDemande() {
  const client = useClient()
  const envoyee = useDemandeEnvoyee()
  return async (demande: NouvelleDemande) => {
    const r = await client.call('pub.request', 'create', { body: versDemande(demande) })
    envoyee.value = { id: r.id, reference: r.reference, email: r.contactEmail }
    return envoyee.value
  }
}
