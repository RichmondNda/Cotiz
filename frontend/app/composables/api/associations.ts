// Associations : espace gestionnaire (as.get, as.patch, as.pm, as.onb) et espace plateforme (pf.asso.*).
import type { ApiClient } from './client'
import type {
  Association, AssociationListe, FicheAssociationPlateforme, ListeAssociations, ModificationAssociation,
  NouvelleAssociationPlateforme, SuspensionAssociation,
} from '~~/types'
import { associationCourante } from './session'
import { STATUT_ASSOCIATION, STATUT_ASSOCIATION_INVERSE, versE164 } from './vues/communs'
import { versMoyens, vueAssociation, vueAssociationListe, vueFiche } from './vues/associations'
import { vuePlans } from './vues/plans'

// ---------------------------------------------------------------- Espace gestionnaire

/** Association du gestionnaire (profil, moyens, compteurs), au format de l'interface. */
export async function chargerAssociation(client: ApiClient, aid: string): Promise<Association> {
  const [a, moyens, tdb, sub, equipe] = await Promise.all([
    client.call('as.get', 'get', { params: { aid } }),
    client.call('as.pm', 'list', { params: { aid } }),
    client.call('as.dashboard', 'get', { params: { aid } }),
    client.call('bl.sub', 'get', { params: { aid } }),
    client.call('tm.team', 'list', { params: { aid } }).catch(() => null),
  ])
  return vueAssociation(a, moyens.items, {
    planId: sub.plan.id, projets: tdb.projectsCount, souscripteurs: tdb.subscribersCount,
    gestionnaires: equipe?.items.length ?? sub.quotas.managers.used + 1, limiteSecondaires: equipe?.seats.limit ?? sub.quotas.managers.limit ?? undefined,
    prochaineEcheance: sub.currentPeriodEnd ?? undefined,
  })
}

/** Association du gestionnaire connecté (profil, moyens de paiement par défaut). */
export const useAssociationGestionnaire = () =>
  useLecture<Association>('mon-association', async client => chargerAssociation(client, await associationCourante(client)))

/** Mise à jour du profil ou des moyens de paiement de l'association (onboarding, paramètres). */
export function useModificationAssociation() {
  const client = useClient()
  return async (aid: string, modification: ModificationAssociation) => {
    const a = await client.call('as.get', 'get', { params: { aid } })
    const profil = Object.fromEntries(Object.entries({
      name: modification.nom, description: modification.description, city: modification.ville, contactEmail: modification.emailContact,
      contactPhone: modification.telephoneContact ? versE164(modification.telephoneContact) : undefined,
    }).filter(([, v]) => v !== undefined))
    if (Object.keys(profil).length) await client.call('as.patch', 'patch', { params: { aid }, body: profil, ifMatch: a.version })
    if (modification.modalitesPaiement) {
      await client.call('as.pm', 'replace', { params: { aid }, body: { items: versMoyens(modification.modalitesPaiement, modification.instructionsPaiement) } })
    }
    return chargerAssociation(client, aid)
  }
}

/** Fin de l'onboarding (dernière étape de /asso/bienvenue). */
export function useFinOnboarding() {
  const client = useClient()
  return async (aid: string) => client.call('as.onb', 'complete', { params: { aid } })
}

// ---------------------------------------------------------------- Espace plateforme

/** Liste plateforme des associations et compteurs des puces (super-admin). */
export const useAssociations = (filtres: MaybeRefOrGetter<{ statut?: string, plan?: string, q?: string }> = {}) =>
  useLecture<ListeAssociations>(() => `associations:${JSON.stringify(toValue(filtres))}`, async (client) => {
    const f = toValue(filtres)
    let facets: Record<string, Record<string, number>> | undefined
    const { items } = await toutesLesPages(async (cursor) => {
      const r = await client.call('pf.asso.list', 'list', {
        query: {
          limit: 100, cursor, q: f.q,
          status: f.statut ? STATUT_ASSOCIATION_INVERSE[f.statut as keyof typeof STATUT_ASSOCIATION_INVERSE] as 'active' : undefined,
        },
      })
      facets = r.facets
      return r
    })
    const plans = f.plan ? (await client.call('pf.plans', 'list')).items : []
    const lignes: AssociationListe[] = items.map(vueAssociationListe).filter(a => !f.plan || plans.find(p => p.id === a.planId)?.code === f.plan || a.planId === f.plan)
    const statuts = facets?.status ?? {}
    const compteur = (s: string) => Object.entries(statuts).filter(([k]) => STATUT_ASSOCIATION[k] === s).reduce((t, [, n]) => t + n, 0)
    const compteurs = { active: compteur('active'), impayee: compteur('impayee'), suspendue: compteur('suspendue'), onboarding: compteur('onboarding') }
    return { associations: lignes, compteurs: { toutes: compteurs.active + compteurs.impayee + compteurs.suspendue + compteurs.onboarding, ...compteurs } }
  })

async function fiche(client: ApiClient, id: string): Promise<FicheAssociationPlateforme> {
  const [d, plans, projets, membres, factures] = await Promise.all([
    client.call('pf.asso.get', 'get', { params: { id } }),
    client.call('pf.plans', 'list'),
    client.call('pf.asso.sub', 'projects', { params: { id }, query: { limit: 100 } }),
    client.call('pf.asso.sub', 'members', { params: { id }, query: { limit: 100 } }),
    client.call('pf.invoices', 'list', { query: { associationId: id, limit: 100 } }),
  ])
  const plan = vuePlans(plans.items).find(p => p.id === d.plan.id)!
  // Cycle roulant aux inscriptions ouvertes : « inscrits / requis » (lu sur le projet, réservé au gestionnaire : absent ici).
  return vueFiche(d, plan, {
    projets: projets.items, totalProjets: projets.total, membres: membres.items, totalMembres: membres.total,
    factures: factures.items, requis: {},
  })
}

/** Fiche plateforme d'une association (SaAssociation). */
export const useFicheAssociation = (id: MaybeRefOrGetter<string>) =>
  useLecture<FicheAssociationPlateforme>(() => `fiche-association:${toValue(id)}`, client => fiche(client, toValue(id)))

/** Actions plateforme sur une association : création directe, suspension, réactivation, plan et comptes. */
export function useActionsAssociationPlateforme() {
  const client = useClient()
  return {
    creer: async (n: NouvelleAssociationPlateforme): Promise<AssociationListe> => {
      const r = await client.call('pf.asso.create', 'create', { body: {
        association: { name: n.association.nom, type: n.association.type, city: n.association.ville, country: n.association.pays, registrationNumber: n.association.numeroEnregistrement ?? null, description: n.association.description ?? null },
        owner: { firstName: n.gestionnaire.prenom, lastName: n.gestionnaire.nom, email: n.gestionnaire.email, phone: versE164(n.gestionnaire.telephone) },
        subscription: { planId: n.abonnement.planId, startsOn: n.abonnement.debut, managerSeats: n.abonnement.comptesGestionnaires, trialDays: n.abonnement.essaiJours },
        issueCredentialsNow: n.envoyerIdentifiants,
      } })
      return vueAssociationListe(r.association)
    },
    suspendre: async (id: string, s: SuspensionAssociation) => {
      const d = await client.call('pf.asso.get', 'get', { params: { id } })
      await client.call('pf.asso.suspend', 'suspend', { params: { id }, body: { reason: s.motif, confirmName: d.name } })
      return fiche(client, id)
    },
    reactiver: async (id: string) => {
      await client.call('pf.asso.suspend', 'reactivate', { params: { id } })
      return fiche(client, id)
    },
    changerAbonnement: async (id: string, c: { planId?: string, comptesGestionnaires?: number }) => {
      if (c.planId) await client.call('pf.asso.plan', 'changePlan', { params: { id }, body: { planId: c.planId, effectiveOn: new Date().toISOString().slice(0, 10) } })
      if (c.comptesGestionnaires) {
        const d = await client.call('pf.asso.get', 'get', { params: { id } })
        await client.call('pf.asso.patch', 'patch', { params: { id }, body: { managerSeatsOverride: c.comptesGestionnaires }, ifMatch: d.version })
      }
      return fiche(client, id)
    },
  }
}
