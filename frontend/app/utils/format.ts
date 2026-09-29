// Formats d'affichage Cotiz (montants, dates, téléphones), en français.
// Montant : `25 000 F` — espace fine insécable (U+202F) entre les milliers, pas de décimales,
// espace insécable (U+00A0) avant l'unité pour que le montant ne soit jamais coupé.

import { maintenant } from './date-reference'

export const ESPACE_FINE = '\u202F'
export const ESPACE_INSECABLE = '\u00A0'

/** Sépare les milliers d'un entier positif avec une espace fine insécable. */
function milliers(n: number): string {
  return Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ESPACE_FINE)
}

/**
 * 25000 → `25 000 F`. Les placeholders de la maquette (`[MONTANT]`) passent tels quels : `[MONTANT] F`.
 * `unite: false` → `25 000` (champs avec suffixe « F CFA »).
 */
export function formatFCFA(n: number | string, options: { unite?: boolean } = {}): string {
  const unite = options.unite === false ? '' : `${ESPACE_INSECABLE}F`
  if (typeof n === 'string') return n + unite
  return (n < 0 ? '−' : '') + milliers(n) + unite
}

/** Saisie d'un montant : garde les chiffres, reformate les milliers (`75000` → `75 000`). */
export function formatSaisieMontant(saisie: string): string {
  const chiffres = saisie.replace(/\D/g, '')
  return chiffres ? milliers(Number(chiffres)) : ''
}

/** Inverse de formatSaisieMontant : `75 000` → 75000, vide → null. */
export function lireMontant(saisie: string): number | null {
  const chiffres = saisie.replace(/\D/g, '')
  return chiffres ? Number(chiffres) : null
}

/** Date ISO réelle (`2026-03-05…`), par opposition aux placeholders de la maquette (`[DATE]`). */
export function estDate(d?: string | null): d is string {
  return Boolean(d && /^\d{4}-\d{2}-\d{2}/.test(d))
}

/** Pourcentage entier : 82 → `82 %` (espace insécable). */
export function formatPourcent(n: number | string): string {
  return `${n}${ESPACE_INSECABLE}%`
}

const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.']
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.']

/** Lit une date ISO (`2026-10-05` = minuit local, pas UTC, pour ne pas décaler le jour). */
export function lireDate(d: string | Date): Date {
  if (d instanceof Date) return d
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d)
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(d)
}

export type StyleDate = 'court' | 'long' | 'numerique' | 'jour-mois' | 'jour-mois-long' | 'complet'

/**
 * - `court` (défaut) : `5 oct. 2026`
 * - `long` : `5 octobre 2026`
 * - `numerique` : `05/10/2026` (tableaux)
 * - `jour-mois` : `5 oct.`
 * - `jour-mois-long` : `5 octobre`
 * - `complet` : `vendredi 25 septembre 2026`
 */
export function formatDate(d: string | Date, style: StyleDate = 'court'): string {
  const date = lireDate(d)
  const j = date.getDate()
  const m = date.getMonth()
  const a = date.getFullYear()
  switch (style) {
    case 'long': return `${j} ${MOIS_LONGS[m]} ${a}`
    case 'numerique': return `${String(j).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${a}`
    case 'jour-mois': return `${j} ${MOIS_COURTS[m]}`
    case 'jour-mois-long': return `${j} ${MOIS_LONGS[m]}`
    case 'complet': return `${JOURS[date.getDay()]} ${j} ${MOIS_LONGS[m]} ${a}`
    default: return `${j} ${MOIS_COURTS[m]} ${a}`
  }
}

/** Mois d'une échéance : `Août 2026` (`long`), `Août` (`seul`), `Sept.` (`court`, en-têtes de grille). */
export function formatMois(d: string | Date, style: 'long' | 'seul' | 'court' | 'court-annee' = 'long'): string {
  const date = lireDate(d)
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
  const m = date.getMonth()
  switch (style) {
    case 'seul': return cap(MOIS_LONGS[m]!)
    case 'court': return cap(MOIS_COURTS[m]!)
    case 'court-annee': return `${cap(MOIS_COURTS[m]!)} ${date.getFullYear()}`
    default: return `${cap(MOIS_LONGS[m]!)} ${date.getFullYear()}`
  }
}

function joursEntre(a: Date, b: Date): number {
  const jour = (x: Date) => Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())
  return Math.round((jour(b) - jour(a)) / 86_400_000)
}

/**
 * Date relative, pour les files et les notifications :
 * `aujourd'hui`, `hier`, `il y a 3 j` (≤ 6 jours), puis la date courte, sans l'année si c'est la même (`3 sept.`).
 * Dans le futur : `demain`, `dans 10 jours`.
 * `style: 'long'` → `il y a 3 jours`.
 * Si la date porte une heure et date d'aujourd'hui : `il y a 2 h`, `il y a 5 min`.
 */
export function formatRelatif(d: string | Date, options: { maintenant?: Date, style?: 'court' | 'long' } = {}): string {
  const date = lireDate(d)
  const ref = options.maintenant ?? maintenant()
  const long = options.style === 'long'
  const jours = joursEntre(date, ref)
  if (jours === 0) {
    const avecHeure = typeof d !== 'string' || d.includes('T')
    const minutes = Math.floor((ref.getTime() - date.getTime()) / 60_000)
    if (avecHeure && minutes >= 0) {
      if (minutes < 1) return 'à l\'instant'
      if (minutes < 60) return `il y a ${minutes} min`
      return `il y a ${Math.floor(minutes / 60)} h`
    }
    return 'aujourd\'hui'
  }
  if (jours === 1) return 'hier'
  if (jours > 1 && jours <= 6) return long ? `il y a ${jours} jours` : `il y a ${jours} j`
  if (jours < 0) {
    const dans = -jours
    if (dans === 1) return 'demain'
    return `dans ${dans} jour${dans > 1 ? 's' : ''}`
  }
  return date.getFullYear() === ref.getFullYear() ? formatDate(date, 'jour-mois') : formatDate(date)
}

/** Jour de semaine abrégé (`lun.`) — groupe « Cette semaine » des notifications. */
export function formatJourSemaine(d: string | Date): string {
  return JOURS_COURTS[lireDate(d).getDay()]!
}

/** Nombre de jours entre une date et la date de référence (positif = passé). */
export function joursDepuis(d: string | Date, ref: Date = maintenant()): number {
  return joursEntre(lireDate(d), ref)
}

/**
 * Téléphone : indicatif + groupes de 2 chiffres. `+2250708091011` → `+225 07 08 09 10 11`.
 * Sans indicatif, +225 par défaut. Les valeurs non numériques (placeholders) passent telles quelles.
 */
export function formatTelephone(tel: string, indicatif = '225'): string {
  const brut = tel.replace(/[\s.-]/g, '')
  if (!/^\+?\d+$/.test(brut)) return tel
  let pays = indicatif
  let numero = brut.replace(/^\+/, '')
  if (brut.startsWith('+')) {
    pays = numero.slice(0, 3)
    numero = numero.slice(3)
  }
  else if (numero.startsWith('00')) {
    pays = numero.slice(2, 5)
    numero = numero.slice(5)
  }
  const groupes = numero.match(/.{1,2}/g) ?? []
  return `+${pays} ${groupes.join(' ')}`
}

/** Initiales pour les avatars : `Awa Koné` → `AK`, `Entraide Yopougon` → `EY`, `Richy` → `R`. */
export function initiales(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(m => !/^(de|des|du|la|le|l'|d')$/i.test(m))
  return mots.slice(0, 2).map(m => m.charAt(0).toUpperCase()).join('')
}

/** Accord simple : `pluriel(3, 'échéance')` → `3 échéances`. */
export function pluriel(n: number, singulier: string, pluriel?: string): string {
  return `${n} ${n > 1 ? (pluriel ?? `${singulier}s`) : singulier}`
}

/** Nom d'association abrégé pour les cartes : `Association des ressortissants de Man` → `Assoc. des ressortissants de Man`. */
export function nomCourtAssociation(nom: string): string {
  return nom.replace(/^Association /, 'Assoc. ')
}

/** Date et heure d'une signature : `25/09/2026 à 10:42`. */
export function formatDateHeure(d: string | Date): string {
  const date = lireDate(d)
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return `${formatDate(date, 'numerique')} à ${hh}:${mm}`
}

/** Heure à la française : « 10 h 14 », « 9 h 02 ». */
export function formatHeure(d: string | Date): string {
  const date = lireDate(d)
  return `${date.getHours()} h ${String(date.getMinutes()).padStart(2, '0')}`
}
