// Profil du gestionnaire connecté (me, me.profile, me.prefs).
import type { ModificationProfilGestionnaire, ProfilGestionnaire } from '~~/types'
import type { ApiClient } from './client'
import { email, tel } from './vues/communs'
import { traduireErreur } from './vues/erreurs'

/** Préférences de notification de MgProfil ↔ types d'événements (canal « dans l'application »). */
const PREFERENCES = { paiementDeclare: 'payment.declared', contratSigne: 'contract.signed', resumeQuotidien: 'digest.daily' } as const

async function profil(client: ApiClient): Promise<ProfilGestionnaire> {
  const [me, p, prefs] = await Promise.all([client.call('me', 'get'), client.call('me.profile', 'get'), client.call('me.prefs', 'get')])
  const courante = me.memberships.find(x => x.association.id === me.currentAssociationId)
  const active = (type: string) => prefs.items.find(x => x.type === type && x.channel === 'in_app')?.enabled ?? false
  return {
    id: p.id, prenom: p.firstName, nom: p.lastName, email: email(p.email), telephone: p.phone ? tel(p.phone) : undefined,
    role: courante?.role === 'owner' ? 'principal' : 'secondaire', associationNom: courante?.association.name ?? '',
    motDePasseModifieLe: p.passwordChangedAt?.slice(0, 10) ?? '[DATE]',
    preferences: { paiementDeclare: active(PREFERENCES.paiementDeclare), contratSigne: active(PREFERENCES.contratSigne), resumeQuotidien: active(PREFERENCES.resumeQuotidien) },
  }
}

/** Profil du gestionnaire connecté (MgProfil). */
export const useProfilGestionnaire = () => useLecture<ProfilGestionnaire>('profil-gestionnaire', profil)

/** Modification des informations et préférences, changement de mot de passe. */
export function useActionsProfilGestionnaire() {
  const client = useClient()
  return {
    modifier: async (m: ModificationProfilGestionnaire) => {
      try {
        const champs = Object.fromEntries(Object.entries({ firstName: m.prenom, lastName: m.nom }).filter(([, v]) => v !== undefined))
        // Ni le téléphone (écart R4) ni l'email (figé en V1, ui-deviations) ne se modifient par me.profile.
        if (Object.keys(champs).length) await client.call('me.profile', 'patch', { body: champs })
        if (m.preferences) {
          const prefs = await client.call('me.prefs', 'get')
          const autres = prefs.items.filter(x => !Object.values(PREFERENCES).includes(x.type as never))
          await client.call('me.prefs', 'replace', { body: { items: [...autres, ...Object.entries(PREFERENCES).map(([cle, type]) => ({ type, channel: 'in_app' as const, enabled: m.preferences![cle as keyof typeof PREFERENCES] }))] } })
        }
        return profil(client)
      }
      catch (e) {
        traduireErreur(e, { 'champ:firstName': 'prenom-requis', 'champ:lastName': 'nom-requis' })
      }
    },
    changerMotDePasse: async (actuel: string, nouveau: string) => {
      try {
        await client.call('me.profile', 'changePassword', { body: { currentPassword: actuel, newPassword: nouveau } })
        return profil(client)
      }
      catch (e) {
        traduireErreur(e, { invalid_credentials: 'mot-de-passe-incorrect', weak_password: 'mot-de-passe-faible', validation_failed: 'mot-de-passe-faible' })
      }
    },
  }
}
