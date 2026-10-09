// Espace plateforme : tableau de bord (pf.dashboard), facturation (pf.invoices), personnel (pf.staff), profil (me.profile, me.prefs).
import type {
  FacturationPlateforme, ModificationProfilPlateforme, ProfilPlateforme, RolePlateforme, TableauDeBordPlateforme, UtilisateurPlateforme,
} from '~~/types'
import type { ApiClient } from './client'
import { email, jour, local, m } from './vues/communs'
import { statutFacture, vueActivite } from './vues/associations'
import { vueDemande } from './vues/demandes'
import { traduireErreur } from './vues/erreurs'

const ROLE: Record<string, RolePlateforme> = { owner: 'proprietaire', admin: 'administrateur', support: 'support' }
const SIGNAL = { unpaid: 'impaye', inactive: 'onboarding', quota: 'quota' } as const

/** Tableau de bord plateforme (SaDashboard). */
export const useTableauDeBordPlateforme = () =>
  useLecture<TableauDeBordPlateforme>('tableau-de-bord-plateforme', async (client) => {
    const t = await client.call('pf.dashboard', 'get')
    return {
      demandesATraiter: t.pendingRequests,
      demandesPrioritaires: t.oldestPendingRequests.map(vueDemande),
      kpi: {
        associationsActives: t.kpi.activeAssociations, nouvellesCeMois: t.kpi.newAssociationsThisMonth, souscripteurs: t.kpi.subscribers,
        revenuMensuel: m(t.kpi.monthlyRecurringRevenue), abonnementsAJour: t.kpi.subscriptionsUpToDate, abonnementsImpayes: t.kpi.subscriptionsUnpaid,
        totalAssociations: t.kpi.totalAssociations,
      },
      evolution: t.activeAssociationsByMonth.map(x => ({ mois: x.month, valeur: x.count })),
      repartition: t.associationsByPlan.map(x => ({ planId: x.plan.id, nom: x.plan.name, nombre: x.count })),
      aSurveiller: t.watchlist.map(w => ({ associationId: w.associationId, nom: w.name, signal: SIGNAL[w.signal], depuis: w.since })),
      activite: t.activity.map(vueActivite),
    }
  })

/** Facturation globale (V2, fonctionnalité `invoices`). */
export const useFacturationPlateforme = (options: { immediat?: boolean } = {}) =>
  useLecture<FacturationPlateforme>('facturation-plateforme', async (client) => {
    const r = await client.call('pf.invoices', 'list', { query: { limit: 100 } })
    const payees = r.items.filter(f => f.status === 'paid')
    return {
      kpi: {
        revenuMois: m(r.summary.revenueThisMonth), abonnements: r.total, encaisse: m(r.summary.collected), facturesPayees: payees.length,
        enAttente: m(r.summary.pending), impaye: m(r.summary.overdue), associationsImpayees: new Set(r.items.filter(f => f.status === 'overdue').map(f => f.association.id)).size,
      },
      factures: r.items.map(f => ({
        id: f.id, numero: f.number, associationId: f.association.id, associationNom: f.association.name, periode: f.periodStart,
        montant: m(f.amount), emiseLe: f.issuedAt ? jour(f.issuedAt) : null, echeance: f.dueAt ? jour(f.dueAt) : jour(f.periodStart), statut: statutFacture(f.status),
      })),
    }
  }, options)

/** Équipe interne de Cotiz (V2, lot 4.7). */
export const useUtilisateursPlateforme = (options: { immediat?: boolean } = {}) =>
  useLecture<UtilisateurPlateforme[]>('utilisateurs-plateforme', async (client) => {
    const r = await client.call('pf.staff', 'list')
    return r.items.map(x => ({
      id: x.user.id, nom: `${x.user.firstName} ${x.user.lastName}`.trim(), email: email(x.user.email), role: ROLE[x.role]!,
      derniereConnexion: x.lastLoginAt ? local(x.lastLoginAt) : (x.status === 'active' ? '[date]' : null), statut: x.status === 'invited' ? 'invite' : 'actif',
    }))
  }, options)

/** Préférences de SaProfil ↔ types d'événements (canal « dans l'application »). */
const PREFERENCES = { nouvelleDemande: 'request.received', abonnementImpaye: 'subscription.past_due', nouvelleAssociation: 'association.created', resumeHebdomadaire: 'digest.weekly' } as const

async function profil(client: ApiClient): Promise<ProfilPlateforme> {
  const [me, p, prefs] = await Promise.all([client.call('me', 'get'), client.call('me.profile', 'get'), client.call('me.prefs', 'get')])
  const active = (type: string) => prefs.items.find(x => x.type === type && x.channel === 'in_app')?.enabled ?? false
  return {
    prenom: p.firstName, nom: p.lastName || '[Nom]', email: email(p.email), role: ROLE[me.platformRole ?? 'owner']!,
    preferences: { nouvelleDemande: active(PREFERENCES.nouvelleDemande), abonnementImpaye: active(PREFERENCES.abonnementImpaye), nouvelleAssociation: active(PREFERENCES.nouvelleAssociation), resumeHebdomadaire: active(PREFERENCES.resumeHebdomadaire) },
  }
}

/** Profil du super-admin connecté (SaProfil). */
export const useProfilPlateforme = () => useLecture<ProfilPlateforme>('profil-plateforme', profil)

export function useActionsProfilPlateforme() {
  const client = useClient()
  return {
    modifier: async (mod: ModificationProfilPlateforme) => {
      try {
        const champs = Object.fromEntries(Object.entries({ firstName: mod.prenom, lastName: mod.nom, email: mod.email }).filter(([, v]) => v !== undefined))
        if (Object.keys(champs).length) await client.call('me.profile', 'patch', { body: champs })
        if (mod.preferences) {
          const prefs = await client.call('me.prefs', 'get')
          const autres = prefs.items.filter(x => !Object.values(PREFERENCES).includes(x.type as never))
          await client.call('me.prefs', 'replace', { body: { items: [...autres, ...Object.entries(PREFERENCES).map(([cle, type]) => ({ type, channel: 'in_app' as const, enabled: mod.preferences![cle as keyof typeof PREFERENCES] }))] } })
        }
        return profil(client)
      }
      catch (e) {
        traduireErreur(e, { 'champ:email': 'email-existant', 'champ:firstName': 'prenom-requis' })
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
