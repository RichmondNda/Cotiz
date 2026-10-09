// Échéancier d'un projet à partir de ses paramètres (création de projet, aperçu, ajout d'un souscripteur).
// Les dates et montants viennent de `generateSchedule` de @cotiz/domain (règle n° 2) ; ce fichier ne fait que
// traduire les termes de l'interface et mettre en forme. Fonctions pures, sans dépendance à Vue.
import { DomainError, generateSchedule, Money } from '@cotiz/domain'
import type { Frequency, ScheduleLine } from '@cotiz/domain'
import type { Frequence, MontantFCFA, TypeCalendrier } from '~~/types'

const FREQUENCES_DOMAINE: Record<Frequence, Frequency> = {
  hebdomadaire: 'weekly',
  mensuelle: 'monthly',
  trimestrielle: 'quarterly',
  semestrielle: 'semiannual',
  annuelle: 'annual',
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

/** Termes d'un projet tels que l'interface les saisit ou les affiche. */
export interface TermesEcheancier {
  fondsEntree: MontantFCFA | null
  montantEcheance: MontantFCFA
  frequence: Frequence
  /** Jour du mois ; hebdomadaire sans jour saisi : jour de la semaine de la date de début. */
  jourEcheance?: number
  typeCalendrier: TypeCalendrier
  dateDebut: string
  /** Dates fixes uniquement. */
  dateFin?: string | null
  /** Cycle roulant : nombre d'échéances générées (12 par défaut). */
  horizon?: number | null
}

/** Jour ISO (1 = lundi … 7 = dimanche) d'une date `AAAA-MM-JJ`. */
const jourIso = (date: string) => ((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) + 1

/** Lignes de l'échéancier (fonds d'entrée compris) ; termes incomplets ou invalides (saisie en cours) : aucune ligne. */
export function lignesEcheancier(t: TermesEcheancier): ScheduleLine[] {
  try {
    return generateSchedule({
      installmentAmount: t.montantEcheance,
      entryFeeAmount: t.fondsEntree,
      frequency: FREQUENCES_DOMAINE[t.frequence],
      dueDay: t.jourEcheance ?? (t.frequence === 'hebdomadaire' ? jourIso(t.dateDebut) : Number(t.dateDebut.slice(8, 10))),
      scheduleType: t.typeCalendrier === 'dates_fixes' ? 'fixed' : 'rolling',
      startDate: t.dateDebut,
      endDate: t.dateFin ?? null,
      horizon: t.horizon ?? null,
    })
  }
  catch (e) {
    if (e instanceof DomainError) return []
    throw e
  }
}

/** Nombre d'échéances (hors fonds d'entrée) d'un projet à dates fixes : mars 2026 → août 2027, mensuel = 18. */
export function nbEcheances(t: TermesEcheancier): number | null {
  if (t.typeCalendrier !== 'dates_fixes') return null
  const n = lignesEcheancier(t).filter(l => l.kind === 'periodic').length
  return n || null
}

/** Engagement total par souscripteur (dates fixes) : somme des lignes de l'échéancier. */
export function totalParSouscripteur(t: TermesEcheancier): MontantFCFA | null {
  if (t.typeCalendrier !== 'dates_fixes') return null
  const lignes = lignesEcheancier(t)
  if (!lignes.length) return null
  try {
    // Somme contrôlée du domaine : au-delà des entiers sûrs (saisie démesurée) → pas de total plutôt qu'une erreur au rendu.
    return Money.sum(lignes.map(l => Money.of(l.amountDue, 'XOF')), 'XOF').amount
  }
  catch (e) {
    if (e instanceof DomainError) return null
    throw e
  }
}

export interface LigneEcheancier {
  libelle: string
  /** Date ISO de l'échéance. */
  date: string
  montant: MontantFCFA
  estFondsEntree: boolean
}

/** Premières lignes de l'échéancier (récapitulatif) : « Fonds d’entrée », puis « Échéance 1 »… ; `limite` lignes au plus. */
export function premieresEcheances(t: TermesEcheancier, limite = 12): LigneEcheancier[] {
  return lignesEcheancier(t).slice(0, limite).map(l => ({
    libelle: l.kind === 'entry_fee' ? 'Fonds d’entrée' : `Échéance ${l.sequence}`,
    date: l.dueDate,
    montant: l.amountDue,
    estFondsEntree: l.kind === 'entry_fee',
  }))
}
