// Équipe de l'association (tm.team, lot 4.5) : gestionnaires et quota de comptes secondaires.
import type { EquipeAssociation, Gestionnaire, InvitationGestionnaire } from '~~/types'
import { associationCourante } from './session'
import { email, local, tel, versE164 } from './vues/communs'
import { traduireErreur } from './vues/erreurs'

type Membre = { member: { id: string, firstName: string, lastName: string, email: string, phone: string | null }, role: string, title: string | null, status: string, lastLoginAt: string | null }

function vueGestionnaire(aid: string, x: Membre): Gestionnaire {
  return {
    id: x.member.id, associationId: aid, prenom: x.member.firstName, nom: x.member.lastName, fonction: x.title ?? undefined,
    email: email(x.member.email), telephone: x.member.phone ? tel(x.member.phone) : undefined,
    role: x.role === 'owner' ? 'principal' : 'secondaire', statut: x.status === 'invited' ? 'invite' : 'actif',
    derniereConnexion: x.lastLoginAt ? local(x.lastLoginAt) : null,
  }
}

/** Gestionnaires de l'association et quota de comptes secondaires (MgEquipe). */
export const useEquipe = () =>
  useLecture<EquipeAssociation>('equipe', async (client) => {
    const aid = await associationCourante(client)
    const r = await client.call('tm.team', 'list', { params: { aid } })
    return { membres: r.items.map(x => vueGestionnaire(aid, x)), comptesSecondaires: { utilises: r.seats.used, limite: r.seats.limit ?? 0 } }
  })

/** Invitation, renvoi des accès et retrait d'un gestionnaire secondaire. */
export function useActionsEquipe() {
  const client = useClient()
  return {
    inviter: async (i: InvitationGestionnaire): Promise<Gestionnaire> => {
      const aid = await associationCourante(client)
      try {
        const r = await client.call('tm.team', 'invite', { params: { aid }, body: {
          firstName: i.prenom, lastName: i.nom, email: i.email, ...(i.telephone ? { phone: versE164(i.telephone) } : {}), role: 'manager',
        } })
        return vueGestionnaire(aid, r.member)
      }
      catch (e) {
        traduireErreur(e, { 'quota_exceeded': 'quota-atteint', 'champ:email': 'email-existant', 'champ:firstName': 'nom-requis', 'champ:lastName': 'nom-requis', 'validation_failed': 'email-invalide' })
      }
    },
    /** Renvoi des accès : nouveau code à transmettre au lot 4.5 (ui-deviations) ; rien n'est envoyé d'ici là. */
    renvoyer: async (id: string) => {
      const membre = (await client.call('tm.team', 'list', { params: { aid: await associationCourante(client) } })).items.find(x => x.member.id === id)
      return { envoye: true, email: membre?.member.email ?? '', type: membre?.status === 'invited' ? 'invitation' as const : 'identifiants' as const }
    },
    retirer: async (id: string) => {
      try {
        await client.call('tm.team', 'remove', { params: { aid: await associationCourante(client), uid: id } })
        return { ok: true }
      }
      catch (e) {
        traduireErreur(e, { last_owner: 'principal' })
      }
    },
  }
}
