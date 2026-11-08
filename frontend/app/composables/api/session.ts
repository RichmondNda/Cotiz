// Session et navigation : utilisateur connecté (`GET /me`), droits et fonctionnalités, compteurs des menus.
import type { Feature, Permission } from '@cotiz/contracts'
import type { ApiClient } from './client'
import type { CompteursNavigation, Role, UtilisateurSession } from '~~/types'
import { initiales } from '~/utils/format'
import { AVEC_MOCKS, espaceBascule, lotsBascules } from '~/utils/bascule'
import { fonctionnalitesActives } from '~/utils/fonctionnalites'
import { useSession } from '~/composables/useSession'

const ROLE: Record<string, Role> = { subscriber: 'souscripteur', association: 'gestionnaire', platform: 'superadmin' }
const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

/** Association courante du gestionnaire connecté (`Me.currentAssociationId`). */
export async function associationCourante(client: ApiClient): Promise<string> {
  const me = await client.call('me', 'get')
  if (!me.currentAssociationId) throw createError({ statusCode: 403, statusMessage: 'Aucune association courante' })
  return me.currentAssociationId
}

/** Utilisateur de la session : identité, association courante (nom, plan), droits et fonctionnalités. */
export const useMoi = () => {
  const route = useRoute()
  return useLecture<UtilisateurSession>('session-moi', async (client) => {
    const me = await client.call('me', 'get')
    const role = ROLE[me.space]!
    const courante = me.memberships.find(x => x.association.id === me.currentAssociationId)
    const sub = courante ? await client.call('bl.sub', 'get', { params: { aid: courante.association.id } }) : null
    return {
      id: me.user.id,
      role,
      prenom: me.user.firstName,
      nom: me.user.lastName || undefined,
      fonction: role === 'souscripteur' ? 'Souscripteur' : courante?.title ? majuscule(courante.title) : undefined,
      associationId: courante?.association.id,
      association: courante && sub
        ? { id: courante.association.id, nom: courante.association.name, sigle: initiales(courante.association.name), plan: sub.plan.name }
        : undefined,
      associationsSouscrites: me.memberships
        .filter(x => x.role === 'subscriber')
        .map(x => ({ id: x.association.id, nom: x.association.name })),
      permissions: me.permissions,
      // Espace basculé : les écrans encore simulés gardent leurs fonctionnalités (transition, lot 1.1). Build sans
      // handlers simulés (production) : rien n'est simulé, `GET /me` seul fait foi (« Bientôt disponible » sinon).
      features: AVEC_MOCKS && espaceBascule(me.space)
        ? fonctionnalitesActives(me.features, lotsBascules(me.space), typeof route.query.scenario === 'string' ? route.query.scenario : undefined)
        : me.features,
    }
  })
}

/** Compteurs des menus, recomposés selon l'espace (plus de route dédiée : docs/specs/v0-mapping.md). */
export const useCompteursNavigation = () => {
  const { role } = useSession()
  const { peut } = usePermissions()
  // Réinitialisations : owner et admin plateforme seulement (le support n'a pas `platform.associations.manage`).
  const reinitialisations = computed(() => role.value === 'superadmin' && peut('platform.associations.manage'))
  return useLecture<CompteursNavigation>(() => `compteurs-navigation:${role.value}:${reinitialisations.value}`, async (client) => {
    const compteurs: CompteursNavigation = {
      paiementsAValider: 0, notificationsNonLues: 0, souscripteursEnRetard: 0, demandesATraiter: 0, reinitialisationsATraiter: 0,
    }
    if (!role.value) return compteurs
    compteurs.notificationsNonLues = (await client.call('nt.list', 'unreadCount')).count
    if (role.value === 'gestionnaire') {
      const aid = await associationCourante(client)
      // Paiements à valider : la file réelle (lg.pay.list, lot 2.4), pas le tableau de bord encore simulé.
      const [tdb, file] = await Promise.all([
        client.call('as.dashboard', 'get', { params: { aid } }),
        client.call('lg.pay.list', 'list', { params: { aid }, query: { status: 'pending', limit: 1 } }),
      ])
      compteurs.paiementsAValider = file.total
      compteurs.souscripteursEnRetard = tdb.lateSubscribers.count
    }
    // Demandes en attente : la file réelle (pf.req.list), pas le tableau de bord (lot 1.4).
    if (role.value === 'superadmin') compteurs.demandesATraiter = (await client.call('pf.req.list', 'list', { query: { status: 'pending', limit: 1 } })).total
    if (reinitialisations.value) {
      compteurs.reinitialisationsATraiter = (await client.call('pf.resets', 'list', { query: { status: 'pending', limit: 1 } })).total
    }
    return compteurs
  })
}

/** Droits et fonctionnalités de la session (`GET /me`) : le front masque, le back refuse. */
export function usePermissions() {
  const { data: moi } = useMoi()
  return {
    peut: (permission: Permission) => Boolean(moi.value?.permissions.includes(permission)),
    active: (feature: Feature) => Boolean(moi.value?.features.includes(feature)),
    pret: computed(() => Boolean(moi.value)),
  }
}
