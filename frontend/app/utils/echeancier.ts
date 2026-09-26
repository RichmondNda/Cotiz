// Échéancier d'un projet à partir de ses paramètres (création de projet, aperçu, handler `POST /api/projets`).
// Fonctions pures, sans dépendance à Vue : importées aussi par les mocks Nitro.
import type { Frequence, MontantFCFA } from '~~/types'

/** Pas entre deux échéances, en mois (hebdomadaire : traité à part, en semaines). */
const PAS_MOIS: Record<Exclude<Frequence, 'hebdomadaire'>, number> = {
  mensuelle: 1,
  trimestrielle: 3,
  semestrielle: 6,
  annuelle: 12,
}

/** Unité affichée après le montant : « 25 000 F / mois ». */
export const UNITES_FREQUENCE: Record<Frequence, string> = {
  hebdomadaire: 'semaine',
  mensuelle: 'mois',
  trimestrielle: 'trimestre',
  semestrielle: 'semestre',
  annuelle: 'an',
}

/** Libellés du sélecteur « Fréquence ». */
export const LIBELLES_FREQUENCE: Record<Frequence, string> = {
  hebdomadaire: 'Hebdomadaire',
  mensuelle: 'Mensuelle',
  trimestrielle: 'Trimestrielle',
  semestrielle: 'Semestrielle',
  annuelle: 'Annuelle',
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function lire(isoDate: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

/** `05/03/2026` → `2026-03-05` ; `null` si la saisie n'est pas une date valide. */
export function lireDateSaisie(saisie: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(saisie.trim())
  if (!m) return null
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  if (d.getDate() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1) return null
  return iso(d)
}

/** Masque de saisie JJ/MM/AAAA. */
export function formatSaisieDate(saisie: string): string {
  const c = saisie.replace(/\D/g, '').slice(0, 8)
  return [c.slice(0, 2), c.slice(2, 4), c.slice(4)].filter(Boolean).join('/')
}

/** Date de la n-ième échéance (0 = première), au jour d'échéance donné. */
export function dateEcheance(debut: string, frequence: Frequence, n: number, jour?: number): string | null {
  const d = lire(debut)
  if (!d) return null
  if (frequence === 'hebdomadaire') {
    d.setDate(d.getDate() + 7 * n)
    return iso(d)
  }
  const cible = new Date(d.getFullYear(), d.getMonth() + PAS_MOIS[frequence] * n, 1)
  const dernierJour = new Date(cible.getFullYear(), cible.getMonth() + 1, 0).getDate()
  cible.setDate(Math.min(jour ?? d.getDate(), dernierJour))
  return iso(cible)
}

/** Nombre d'échéances entre deux dates incluses (dates fixes) : mars 2026 → août 2027, mensuel = 18. */
export function nbEcheancesEntre(debut: string, fin: string, frequence: Frequence): number | null {
  const a = lire(debut)
  const b = lire(fin)
  if (!a || !b || b < a) return null
  if (frequence === 'hebdomadaire') return Math.floor((b.getTime() - a.getTime()) / (7 * 86_400_000)) + 1
  const mois = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  return Math.floor(mois / PAS_MOIS[frequence]) + 1
}

/** Engagement total par souscripteur : fonds d'entrée + n × échéance (dates fixes uniquement). */
export function totalParSouscripteur(fondsEntree: MontantFCFA | null, montantEcheance: MontantFCFA, nb: number | null): MontantFCFA | null {
  if (nb === null) return null
  return (fondsEntree ?? 0) + nb * montantEcheance
}

export interface LigneEcheancier {
  libelle: string
  /** Date ISO de l'échéance. */
  date: string
  montant: MontantFCFA
  estFondsEntree: boolean
}

/**
 * Premières lignes de l'échéancier (récapitulatif) : fonds d'entrée à la date de début,
 * puis « Échéance 1 », « Échéance 2 »… ; `limite` lignes au plus, fonds d'entrée compris.
 */
export function premieresEcheances(p: {
  fondsEntree: MontantFCFA | null
  montantEcheance: MontantFCFA
  frequence: Frequence
  jourEcheance?: number
  dateDebut: string
  nbEcheances: number | null
}, limite = 12): LigneEcheancier[] {
  const lignes: LigneEcheancier[] = []
  if (p.fondsEntree) lignes.push({ libelle: 'Fonds d’entrée', date: p.dateDebut, montant: p.fondsEntree, estFondsEntree: true })
  const nb = p.nbEcheances ?? Number.POSITIVE_INFINITY
  for (let i = 0; lignes.length < limite && i < nb; i++) {
    const date = dateEcheance(p.dateDebut, p.frequence, i, p.jourEcheance)
    if (!date) break
    lignes.push({ libelle: `Échéance ${i + 1}`, date, montant: p.montantEcheance, estFondsEntree: false })
  }
  return lignes
}
