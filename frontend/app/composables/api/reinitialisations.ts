// Demandes « mot de passe oublié » des gestionnaires, traitées par le super-admin (pf.resets, SaReinitialisations).
import type { PasswordResetRequest } from '@cotiz/contracts'
import type { CodeReinitialisation, DemandeReinitialisation, StatutReinitialisation } from '~~/types'
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
