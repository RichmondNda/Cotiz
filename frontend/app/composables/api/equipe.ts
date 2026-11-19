// Équipe de l'association (tm.team, lot 4.5) : gestionnaires et quota de comptes secondaires.
import type { CallOutput } from '@cotiz/api-client'
import type { AccesARemettre, EquipeAssociation, Gestionnaire, InvitationGestionnaire } from '~~/types'
import { associationCourante } from './session'
import { email, local, tel, versE164, vueAcces } from './vues/communs'
import { traduireErreur } from './vues/erreurs'

type Membre = CallOutput<'tm.team', 'list'>['items'][number]

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
    // Les places du plan comptent tous les gestionnaires, principal compris ; l'écran montre les comptes secondaires.
    const principaux = r.items.filter(x => x.role === 'owner').length
    return {
      membres: r.items.map(x => vueGestionnaire(aid, x)),
      comptesSecondaires: { utilises: Math.max(0, r.seats.used - principaux), limite: Math.max(0, (r.seats.limit ?? 0) - principaux) },
    }
  })

/** Invitation, renvoi des accès et retrait d'un gestionnaire secondaire. */
export function useActionsEquipe() {
  const client = useClient()
  return {
    /** Invitation par code `team_invite` : le message prêt à transmettre (ui-deviations, aucun email envoyé). */
    inviter: async (i: InvitationGestionnaire): Promise<{ gestionnaire: Gestionnaire, acces: AccesARemettre }> => {
      const aid = await associationCourante(client)
      try {
        const r = await client.call('tm.team', 'invite', { params: { aid }, body: {
          firstName: i.prenom, lastName: i.nom, email: i.email, ...(i.telephone ? { phone: versE164(i.telephone) } : {}), role: 'manager',
        } })
        return { gestionnaire: vueGestionnaire(aid, r.member), acces: vueAcces(r.handoff) }
      }
      catch (e) {
        traduireErreur(e, { 'quota_exceeded': 'quota-atteint', 'champ:email': 'email-existant', 'champ:firstName': 'nom-requis', 'champ:lastName': 'nom-requis', 'validation_failed': 'email-invalide' })
      }
    },
    /** Renvoi d'une invitation : nouveau code (l'ancien ne vaut plus), même rôle ; le message prêt. */
    renvoyer: async (id: string): Promise<AccesARemettre> => {
      const aid = await associationCourante(client)
      const membre = (await client.call('tm.team', 'list', { params: { aid } })).items.find(x => x.member.id === id)
      if (!membre) throw createError({ statusCode: 404, statusMessage: 'Gestionnaire introuvable' })
      const r = await client.call('tm.team', 'invite', { params: { aid }, body: {
        firstName: membre.member.firstName, lastName: membre.member.lastName, email: membre.member.email,
        ...(membre.member.phone ? { phone: membre.member.phone } : {}), role: membre.role === 'viewer' ? 'viewer' : 'manager',
      } })
      return vueAcces(r.handoff)
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
