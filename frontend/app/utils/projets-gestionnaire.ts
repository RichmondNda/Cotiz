// Présentation des projets dans l'espace gestionnaire (tableau de bord, liste des projets) :
// sous-titre, avancement, alerte et pied de la carte projet. Les placeholders (`[N]`, `[MONTANT]`) passent tels quels.
import type { Projet } from '~~/types'
import { formatDate, formatFCFA, formatMois, formatPourcent, pluriel } from './format'
import { libelleFrequence } from './statuts'

export type TonAlerte = 'danger' | 'warning' | 'info'

/** Barre d'un projet dont l'avancement est un placeholder `[N]` : largeur de la maquette (30 %). */
const AVANCEMENT_PLACEHOLDER = 30

const estDate = (d?: string): d is string => Boolean(d && /^\d{4}-\d{2}-\d{2}/.test(d))

export const lienProjetGestionnaire = (p: Projet) => `/asso/projets/${p.id}`

/** « Mensuel · 25 000 F · depuis mars 2026 », « Mensuel · 10 000 F · 12 mois », « Cycle roulant · 10 000 F ». */
export function sousTitreProjet(p: Projet): string {
  const montant = formatFCFA(p.montantEcheance)
  if (p.typeCalendrier === 'cycle_roulant') return `Cycle roulant · ${montant}`
  const base = `${libelleFrequence(p.frequence)} · ${montant}`
  if (p.statut === 'en_cours' && estDate(p.dateDebut)) return `${base} · depuis ${formatMois(p.dateDebut).toLowerCase()}`
  if (p.nbEcheances) return `${base} · ${p.frequence === 'mensuelle' ? `${p.nbEcheances} mois` : pluriel(p.nbEcheances, 'échéance')}`
  return base
}

/** Inscriptions ouvertes : avancement = inscrits / requis ; sinon part de l'engagement collectée. */
export function avancementProjet(p: Projet) {
  if (p.statut === 'inscriptions_ouvertes') {
    const requis = p.souscripteursRequis
    const inscrits = typeof p.nbSouscripteurs === 'number' ? p.nbSouscripteurs : 0
    const pct = requis ? Math.round((inscrits / requis) * 100) : 0
    return {
      valeur: pct,
      gauche: requis ? `${p.nbSouscripteurs} / ${requis} souscripteurs` : pluriel(inscrits, 'souscripteur'),
      droite: requis ? formatPourcent(pct) : '',
      ton: 'info' as const,
    }
  }
  return {
    valeur: typeof p.avancement === 'number' ? p.avancement : AVANCEMENT_PLACEHOLDER,
    gauche: `${formatFCFA(p.montantCollecte)} collectés`,
    droite: formatPourcent(p.avancement),
    ton: 'brand' as const,
  }
}

/** Point d'attention de la carte : retards, puis signatures attendues, puis inscriptions en cours. */
export function alerteProjet(p: Projet, court = false): { texte: string, ton: TonAlerte } | undefined {
  if (p.nbEnRetard > 0) return { texte: `${p.nbEnRetard} en retard`, ton: 'danger' }
  if (p.nbSignaturesAttendues > 0) {
    const n = p.nbSignaturesAttendues
    return { texte: court ? pluriel(n, 'signature') : `${pluriel(n, 'signature')} ${n > 1 ? 'attendues' : 'attendue'}`, ton: 'warning' }
  }
  if (p.statut === 'inscriptions_ouvertes') return { texte: court ? 'Inscriptions' : 'Inscriptions en cours', ton: 'info' }
  return undefined
}

/** « Démarre en janvier 2027 » (inscriptions ouvertes) ou « Prochaine : 5 oct. ». */
export function echeancePied(p: Projet, style: 'carte' | 'mobile' = 'carte'): string | undefined {
  if (p.statut === 'inscriptions_ouvertes' && estDate(p.dateDebut)) {
    return style === 'mobile'
      ? `démarre en ${formatMois(p.dateDebut, 'court-annee').toLowerCase()}`
      : `Démarre en ${formatMois(p.dateDebut).toLowerCase()}`
  }
  if (estDate(p.prochaineEcheance)) {
    const date = formatDate(p.prochaineEcheance, 'jour-mois')
    return style === 'mobile' ? `prochaine : ${date}` : `Prochaine : ${date}`
  }
  return undefined
}

/** Souscripteurs inscrits, avec le requis quand il y en a un : « 12 / 30 », « 52 », « [N] ». */
export function inscritsProjet(p: Projet): string {
  return p.statut === 'inscriptions_ouvertes' && p.souscripteursRequis
    ? `${p.nbSouscripteurs} / ${p.souscripteursRequis}`
    : String(p.nbSouscripteurs)
}

/** Tri du tableau de bord : les projets avec le plus de retards d'abord, puis en cours avant les inscriptions. */
export function trierParRetards(projets: Projet[]): Projet[] {
  const rang = { en_cours: 0, inscriptions_ouvertes: 1, brouillon: 2, termine: 3 }
  return [...projets].sort((a, b) => b.nbEnRetard - a.nbEnRetard || rang[a.statut] - rang[b.statut])
}

/** Propriétés communes de la carte projet gestionnaire (CarteProjet) : en-tête, avancement, lien. */
export function proprietesCarteProjet(p: Projet) {
  const a = avancementProjet(p)
  return {
    nom: p.nom,
    sousTitre: sousTitreProjet(p),
    statut: p.statut,
    progression: a.valeur,
    progressionGauche: a.gauche,
    progressionDroite: a.droite,
    to: lienProjetGestionnaire(p),
  }
}
