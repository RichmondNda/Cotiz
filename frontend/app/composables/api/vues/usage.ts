// pf.asso.usage → onglet « Usage » du détail d'association (lot 4.6). Indicateurs de volume et de délai, aucun montant.
import type { CallOutput } from '@cotiz/api-client'
import type { UsageAssociation } from '~~/types'

type JourUsage = CallOutput<'pf.asso.usage', 'get'>['days'][number]

const JOURS_CONNEXIONS = 30
const MOIS_PAIEMENTS = 6

/** Jour `YYYY-MM-DD` décalé de `n` jours (calendrier civil, sans fuseau). */
export function decalerJours(jour: string, n: number): string {
  const d = new Date(`${jour}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Période lue : du 1er du mois, 5 mois avant celui de `veille`, jusqu'à `veille` (6 mois, mois en cours compris). */
export function periodeUsage(veille: string): { from: string, to: string } {
  const d = new Date(`${veille.slice(0, 7)}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() - (MOIS_PAIEMENTS - 1))
  return { from: d.toISOString().slice(0, 10), to: veille }
}

export function vueUsage(jours: readonly JourUsage[], periode: { from: string, to: string }): UsageAssociation {
  const parJour = new Map(jours.map(j => [j.day, j]))
  const connexions = Array.from({ length: JOURS_CONNEXIONS }, (_, i) => {
    const jour = decalerJours(periode.to, i - (JOURS_CONNEXIONS - 1))
    return { jour, valeur: parJour.get(jour)?.logins ?? 0 }
  })
  const debut30 = connexions[0]?.jour ?? periode.to
  const recents = jours.filter(j => j.day >= debut30)
  const valides = recents.reduce((n, j) => n + j.paymentsValidated, 0)
  const heures = recents.reduce((n, j) => n + j.avgValidationHours * j.paymentsValidated, 0)

  const paiementsParMois = Array.from({ length: MOIS_PAIEMENTS }, (_, i) => {
    const d = new Date(`${periode.from}T00:00:00Z`)
    d.setUTCMonth(d.getUTCMonth() + i)
    const mois = d.toISOString().slice(0, 7)
    const duMois = jours.filter(j => j.day.startsWith(mois))
    return {
      mois: `${mois}-01`,
      declares: duMois.reduce((n, j) => n + j.paymentsDeclared, 0),
      valides: duMois.reduce((n, j) => n + j.paymentsValidated, 0),
    }
  })

  return {
    connexions,
    totalConnexions: connexions.reduce((n, c) => n + c.valeur, 0),
    paiementsParMois,
    // Moyenne des moyennes du jour pondérée par le nombre de validations : délai moyen de toutes les validations.
    delaiMoyenHeures: valides > 0 ? Math.round((heures / valides) * 10) / 10 : null,
    calcule: jours.length > 0,
  }
}
