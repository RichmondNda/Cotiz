// Libellés des échéances côté souscripteur : échéancier, échéances couvertes par un paiement.
import type { Echeance } from '~~/types'
import { formatMois, lireDate } from './format'

const estDatee = (e: Pick<Echeance, 'date'>) => /^\d{4}-\d{2}-\d{2}/.test(e.date)

/** « Fonds d’entrée », « Août 2026 » ; sans date connue (placeholder `[DATE]`) : « Échéance 3 ». */
export function libelleEcheance(e: Pick<Echeance, 'date' | 'rang' | 'estFondsEntree'>): string {
  if (e.estFondsEntree) return 'Fonds d’entrée'
  return estDatee(e) ? formatMois(e.date) : `Échéance ${e.rang}`
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']

/**
 * Échéances couvertes par un paiement, en minuscules :
 * - `court` (listes de paiements) : « juillet », « août, sept. », « entrée + mars » ;
 * - `long` (déclaration) : « août, septembre, octobre ».
 */
export function libelleCouverture(echeances: Pick<Echeance, 'date' | 'rang' | 'estFondsEntree'>[], style: 'court' | 'long' = 'court'): string {
  const tri = [...echeances].sort((a, b) => a.rang - b.rang)
  const mois = tri.filter(e => !e.estFondsEntree)
  const abrege = style === 'court' && mois.length > 1
  const noms = mois.map((e) => {
    if (!estDatee(e)) return `échéance ${e.rang}`
    return abrege ? MOIS_COURTS[lireDate(e.date).getMonth()]! : formatMois(e.date, 'seul').toLowerCase()
  })
  const liste = noms.join(', ')
  if (tri.some(e => e.estFondsEntree)) return liste ? `entrée + ${liste}` : 'fonds d’entrée'
  return liste
}

const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const moisCourt = (e: Pick<Echeance, 'date' | 'rang' | 'estFondsEntree'>) => {
  if (e.estFondsEntree) return 'entrée'
  return estDatee(e) ? MOIS_COURTS[lireDate(e.date).getMonth()]! : `échéance ${e.rang}`
}
const deMois = (e: Pick<Echeance, 'date' | 'rang' | 'estFondsEntree'>) => {
  if (e.estFondsEntree) return 'du fonds d’entrée'
  const nom = estDatee(e) ? formatMois(e.date, 'seul').toLowerCase() : `l’échéance ${e.rang}`
  return /^[aeiouéè]/i.test(nom) ? `d’${nom}` : `de ${nom}`
}

/**
 * Couverture d'un paiement vue par le gestionnaire (cartes « À valider », liste des paiements) :
 * « Sept., oct., nov. » · « Solde d’août » (complète une échéance partielle) · « Sept. + 12 500 F août ».
 */
export function couverturePaiement(
  paiement: { statut: string, repartition: { echeanceId: string, montantAffecte: number }[] },
  echeances: Map<string, Pick<Echeance, 'date' | 'rang' | 'estFondsEntree' | 'montant' | 'statut'>>,
  formatMontant: (n: number) => string,
): string {
  const parts = paiement.repartition
    .map(r => ({ r, e: echeances.get(r.echeanceId) }))
    .filter((x): x is { r: typeof x.r, e: NonNullable<typeof x.e> } => Boolean(x.e))
    .sort((a, b) => b.e.rang - a.e.rang)
  if (!parts.length) return '—'
  const completes = parts.filter(x => x.r.montantAffecte >= x.e.montant).sort((a, b) => a.e.rang - b.e.rang)
  const partielles = parts.filter(x => x.r.montantAffecte < x.e.montant)
  const morceaux: string[] = []
  if (completes.length) morceaux.push(completes.map(x => moisCourt(x.e)).join(', '))
  for (const x of partielles) {
    // Paiement en attente sur une échéance déjà partiellement payée : il en solde le reste.
    morceaux.push(paiement.statut === 'en_attente' && x.e.statut === 'partielle'
      ? `solde ${deMois(x.e)}`
      : `${formatMontant(x.r.montantAffecte)} ${moisCourt(x.e)}`)
  }
  return cap(morceaux.join(' + '))
}
