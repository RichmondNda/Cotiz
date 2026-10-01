// Tableau de bord du gestionnaire (as.dashboard).
import type { TableauDeBordGestionnaire } from '~~/types'
import { associationCourante } from './session'
import { jour, m, pourcent } from './vues/communs'

/** Tableau de bord du gestionnaire connecté (KPI du mois, collecte sur 6 mois, points à traiter). */
export const useTableauDeBordGestionnaire = () =>
  useLecture<TableauDeBordGestionnaire>('tableau-de-bord-gestionnaire', async (client) => {
    const aid = await associationCourante(client)
    const [t, a] = await Promise.all([client.call('as.dashboard', 'get', { params: { aid } }), client.call('as.get', 'get', { params: { aid } })])
    const taux = pourcent(t.recoveryRate)
    return {
      association: { id: a.id, nom: a.name },
      collecteMois: { collecte: m(t.collectedThisMonth), attendu: m(t.expectedThisMonth) },
      paiementsAValider: { nombre: t.paymentsToReview.count, ...(t.paymentsToReview.oldestDeclaredAt ? { plusAncienLe: jour(t.paymentsToReview.oldestDeclaredAt) } : {}) },
      enRetard: { nombre: t.lateSubscribers.count, actifs: t.lateSubscribers.activeCount },
      tauxRecouvrement: typeof taux === 'number' ? taux : 0,
      nbSouscripteurs: t.subscribersCount,
      nbProjets: t.projectsCount,
      contratsNonSignes: t.unsignedContracts.map(c => ({
        contratId: c.enrollmentId, souscripteurId: c.member.id, nomSouscripteur: `${c.member.firstName} ${c.member.lastName}`.trim(),
        projetId: c.project.id, nomProjet: c.project.name,
      })),
      collecteMensuelle: t.monthlyCollection.map((x, i) => ({ mois: x.month, attendu: m(x.expected), recu: m(x.received), enCours: i === t.monthlyCollection.length - 1 })),
    }
  })

