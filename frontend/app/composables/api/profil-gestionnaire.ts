// Profil du gestionnaire connecté (me, me.profile, me.prefs).
import type { ModificationProfilGestionnaire, ProfilGestionnaire } from '~~/types'
import type { ApiClient } from './client'
import { email, tel } from './vues/communs'
import { traduireErreur } from './vues/erreurs'

/**
 * Préférences de notification de MgProfil ↔ types d'événements. Lecture : la cloche (« dans l'application ») ;
 * écriture : un interrupteur règle la cloche et le push du type (lot 4.2, ui-deviations), là où le back les propose.
 */
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
          const valeur = (type: string) => {
            const cle = Object.entries(PREFERENCES).find(([, t]) => t === type)?.[0] as keyof typeof PREFERENCES | undefined
            return cle === undefined ? undefined : m.preferences![cle]
          }
          // Réglages proposés : ceux du type suivent l'interrupteur (cloche et push), les autres restent tels quels.
          const items = prefs.items.map(x => ({ ...x, enabled: x.channel === 'in_app' || x.channel === 'push' ? (valeur(x.type) ?? x.enabled) : x.enabled }))
          // Type pas encore enregistré (données simulées) : sa cloche est ajoutée.
          for (const [cle, type] of Object.entries(PREFERENCES)) {
            if (!items.some(x => x.type === type && x.channel === 'in_app')) items.push({ type, channel: 'in_app', enabled: m.preferences![cle as keyof typeof PREFERENCES] })
          }
          await client.call('me.prefs', 'replace', { body: { items } })
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
