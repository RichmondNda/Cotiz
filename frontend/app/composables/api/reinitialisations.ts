// Demandes « mot de passe oublié » traitées par le rôle supérieur : gestionnaires par le super-admin (pf.resets,
// SaReinitialisations), souscripteurs par leur association (as.resets, MgResets).
import type { PasswordResetRequest } from '@cotiz/contracts'
import type { CodeReinitialisation, DemandeReinitialisation, StatutReinitialisation } from '~~/types'
import { associationCourante } from './session'
import { vueAcces } from './vues/communs'

const STATUT: Record<PasswordResetRequest['status'], StatutReinitialisation> = {
  pending: 'a_traiter', code_issued: 'code_remis', completed: 'terminee', expired: 'expiree', dismissed: 'ignoree',
}

const vueReinitialisation = (r: PasswordResetRequest): DemandeReinitialisation => ({
  id: r.id,
  statut: STATUT[r.status],
  personne: { prenom: r.user.firstName, nom: r.user.lastName, email: r.user.email, telephone: r.user.phone },
  demandeeLe: r.createdAt,
  traiteeLe: r.handledAt,
  traiteePar: r.handledBy ? `${r.handledBy.firstName} ${r.handledBy.lastName}`.trim() : null,
})

/** Toutes les demandes des gestionnaires, plus anciennes d'abord (onglets filtrés à l'écran). */
export const useReinitialisations = () =>
  useLecture<DemandeReinitialisation[]>('reinitialisations', async (client) => {
    const { items } = await toutesLesPages(cursor => client.call('pf.resets', 'list', { query: { limit: 100, cursor } }))
    return items.map(vueReinitialisation)
  })

/** Émission d'un code : renvoyé une seule fois, à afficher aussitôt avec le message prêt. */
export function useEmissionCodeReinitialisation() {
  const client = useClient()
  const { refresh: rechargerCompteurs } = useCompteursNavigation()
  return {
    emettre: async (id: string): Promise<CodeReinitialisation> => {
      const r = await client.call('pf.resets', 'issueCode', { params: { id } })
      await rechargerCompteurs()
      return { demande: vueReinitialisation(r.request), acces: vueAcces(r.handoff) }
    },
  }
}

// Demandes des souscripteurs, traitées par leur association (as.resets, MgResets, lot 3.1).

/** Toutes les demandes des souscripteurs de l'association courante, plus anciennes d'abord. */
export const useReinitialisationsAssociation = (options: { immediat?: boolean } = {}) =>
  useLecture<DemandeReinitialisation[]>('reinitialisations-association', async (client) => {
    const aid = await associationCourante(client)
    const { items } = await toutesLesPages(cursor => client.call('as.resets', 'list', { params: { aid }, query: { limit: 100, cursor } }))
    return items.map(vueReinitialisation)
  }, options)

/** Émission d'un code pour un souscripteur : renvoyé une seule fois, à afficher aussitôt avec le message prêt. */
export function useEmissionCodeReinitialisationAssociation() {
  const client = useClient()
  return {
    emettre: async (id: string): Promise<CodeReinitialisation> => {
      const aid = await associationCourante(client)
      const r = await client.call('as.resets', 'issueCode', { params: { aid, id } })
      return { demande: vueReinitialisation(r.request), acces: vueAcces(r.handoff) }
    },
  }
}
