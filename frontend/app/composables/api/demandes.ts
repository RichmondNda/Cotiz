// Demandes de création d'association : formulaire public (pub.request), traitement par la plateforme (pf.req.*).
import type { ApiClient } from './client'
import type { ApprobationDemande, Demande, DemandeApprouvee, DemandeCreee, DemandeDetaillee, NouvelleDemande, RefusDemande } from '~~/types'
import { STATUT_DEMANDE_INVERSE, vueAcces } from './vues/communs'
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

/**
 * Détail : plan et comptes attribués lus sur l'association créée à l'approbation (`pf.asso.get`, lot 1.4) ; illisible,
 * le plan souhaité est affiché et les comptes sont ceux du plan.
 */
async function detail(client: ApiClient, id: string): Promise<DemandeDetaillee> {
  const d = await client.call('pf.req.get', 'get', { params: { id } })
  let attribution: { planId: string, planNom?: string, comptes: number | null } | undefined
  if (d.decision?.associationId) {
    const a = await client.call('pf.asso.get', 'get', { params: { id: d.decision.associationId } }).catch(() => null)
    if (a) attribution = { planId: a.plan.id, planNom: a.plan.name, comptes: a.subscription.managerSeatsOverride }
  }
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
    /** Les accès du responsable (code d'activation, message prêt) ne sont renvoyés qu'ici : à afficher aussitôt. */
    approuver: async (id: string, a: ApprobationDemande): Promise<DemandeApprouvee> => {
      const r = await client.call('pf.req.approve', 'approve', { params: { id }, body: {
        planId: a.planId, managerSeats: a.comptesGestionnaires, subscriptionStartsOn: a.debutAbonnement,
        internalNote: a.noteInterne || undefined, personalMessage: a.messagePersonnalise || undefined,
      } })
      await rechargerCompteurs()
      return {
        demande: vueDemandeDetaillee(r.request, {
          planId: a.planId,
          planNom: r.request.desiredPlan?.id === a.planId ? r.request.desiredPlan.name : undefined,
          comptes: a.comptesGestionnaires,
        }),
        acces: r.handoff ? vueAcces(r.handoff) : null,
      }
    },
    refuser: async (id: string, r: RefusDemande) => {
      const d = await client.call('pf.req.reject', 'reject', { params: { id }, body: { reasonCode: MOTIFS_REFUS[r.motif] ?? 'other', message: r.precisions || undefined } })
      await rechargerCompteurs()
      return vueDemandeDetaillee(d)
    },
  }
}

/** Dernière demande envoyée depuis ce navigateur (affichée par /demande/confirmation, perdue au rechargement). */
export const useDemandeEnvoyee = () => useState<DemandeCreee | null>('demande-envoyee', () => null)

/**
 * Preuve de travail ALTCHA (décision n° 12) : défi auto-hébergé (`pub.challenge`) résolu dans le navigateur au moment
 * de l'envoi, sans widget affiché (solveur de `altcha/lib`) ; charge = défi et solution en JSON, encodés en base64.
 */
async function preuveAltcha(client: ApiClient): Promise<string> {
  const challenge = await client.call('pub.challenge', 'get', {})
  // Résolution parallèle, comme le widget : un worker PBKDF2 de la bibliothèque par cœur (8 au plus).
  const [{ solveChallengeWorkers }, { default: Pbkdf2Worker }] = await Promise.all([import('altcha/lib'), import('altcha/workers/pbkdf2?worker')])
  const solution = await solveChallengeWorkers({
    challenge,
    concurrency: Math.min(navigator.hardwareConcurrency || 2, 8),
    createWorker: () => new Pbkdf2Worker(),
  })
  if (!solution) throw new Error('Défi ALTCHA non résolu')
  return btoa(JSON.stringify({ challenge, solution }))
}

/** Formulaire public `/demande` : `const envoyer = useEnvoiDemande()` dans `setup`. */
export function useEnvoiDemande() {
  const client = useClient()
  const envoyee = useDemandeEnvoyee()
  return async (demande: NouvelleDemande) => {
    const r = await client.call('pub.request', 'create', { body: versDemande(demande, await preuveAltcha(client)) })
    envoyee.value = { id: r.id, reference: r.reference, email: r.contactEmail }
    return envoyee.value
  }
}
