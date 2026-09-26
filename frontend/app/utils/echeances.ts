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
