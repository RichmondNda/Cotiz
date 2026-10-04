// Projets : Project / ProjectSummary, Enrollment, Grid, ProjectOverview, ProjectReport, ProjectContract du contrat →
// types d'interface (Projet, SouscriptionAvecSouscripteur, LigneGrilleProjet, SyntheseProjet, RapportProjet, ContratProjet).
import { formatMoney, generateSchedule } from '@cotiz/domain'
import type { Enrollment, PaymentMethod, Project, ProjectSummary as ProjectSummarySchema } from '@cotiz/contracts'
import type { z } from 'zod'
import type { CallOutput } from '@cotiz/api-client'
import type {
  ContratProjet, Echeance, LigneGrilleProjet, ModalitePaiement, Projet, RapportProjet, SouscriptionAvecSouscripteur, SyntheseProjet,
} from '~~/types'
import { CALENDRIER, ECHEANCE_FERMEE, email, FREQUENCE, jour, m, mOu, pourcent, SITUATION, STATUT_ECHEANCE, STATUT_PROJET, tel } from './communs'
import { vueModalites } from './associations'

type ProjectSummary = z.output<typeof ProjectSummarySchema>
type Terms = Pick<ProjectSummary, 'entryFee' | 'installmentAmount' | 'frequency' | 'dueDay' | 'scheduleType' | 'startDate' | 'endDate'>

/** Dates de la première et de la dernière échéance (generateSchedule de @cotiz/domain, comme l'aperçu de création). */
export function bornesEcheancier(p: Terms): { premiere: string, derniere: string | null } {
  const lignes = generateSchedule({
    installmentAmount: p.installmentAmount.amount, entryFeeAmount: p.entryFee?.amount ?? null, frequency: p.frequency, dueDay: p.dueDay,
    scheduleType: p.scheduleType, startDate: p.startDate, endDate: p.endDate,
  }).filter(l => l.kind === 'periodic')
  return { premiere: lignes[0]?.dueDate ?? p.startDate, derniere: p.scheduleType === 'fixed' ? lignes.at(-1)?.dueDate ?? p.endDate : null }
}

export interface ExtrasProjet {
  associationId: string
  moyens?: PaymentMethod[]
  apercu?: { nom: string, ton?: 'brand' | 'danger' | 'warning' | 'success' }[]
  contrat?: { bodyTemplate: string, signer: { name: string, title: string } } | null
}

/** Projet de l'interface (cartes, détail gestionnaire, paramètres). */
export function vueProjet(p: ProjectSummary | Project, x: ExtrasProjet): Projet {
  const s = p.stats
  const { premiere, derniere } = bornesEcheancier(p)
  const choisis = 'paymentMethods' in p ? p.paymentMethods : []
  const moyens = choisis.map((c: { paymentMethodId: string }) => x.moyens?.find((pm: PaymentMethod) => pm.id === c.paymentMethodId)).filter((pm): pm is PaymentMethod => Boolean(pm))
  const modalites: ModalitePaiement[] = vueModalites(moyens)
  return {
    id: p.id,
    associationId: x.associationId,
    nom: p.name,
    description: 'description' in p ? p.description || undefined : undefined,
    imageCouvertureNom: p.coverFileName ?? undefined,
    statut: STATUT_PROJET[p.status]!,
    fondsEntree: p.entryFee ? p.entryFee.amount : null,
    montantEcheance: m(p.installmentAmount),
    frequence: FREQUENCE[p.frequency]!,
    jourEcheance: p.dueDay,
    typeCalendrier: CALENDRIER[p.scheduleType]!,
    dateDebut: premiere,
    ...(derniere ? { dateFin: derniere } : {}),
    ...(s.installmentsCount != null ? { nbEcheances: s.installmentsCount } : {}),
    delaiGraceJours: p.graceDays,
    souscripteursRequis: p.requiredSubscribers,
    modalitesPaiement: modalites,
    instructionsPaiement: choisis.find((c: { instructionsOverride: string | null }) => c.instructionsOverride)?.instructionsOverride ?? undefined,
    contratModele: x.contrat?.bodyTemplate ?? '',
    nbSouscripteurs: s.subscribersCount,
    montantCollecte: m(s.collected),
    montantAttenduADate: m(s.expectedToDate),
    tauxRecouvrement: pourcent(s.recoveryRate),
    avancement: pourcent(s.progress),
    nbEnRetard: s.lateSubscribersCount,
    nbSignaturesAttendues: s.pendingSignaturesCount,
    nbPaiementsAValider: s.pendingPaymentsCount,
    ...(s.nextDueDate ? { prochaineEcheance: s.nextDueDate } : {}),
    ...(s.totalPerSubscriber ? { engagementParSouscripteur: m(s.totalPerSubscriber) } : {}),
    ...(x.apercu ? { apercuSouscripteurs: x.apercu } : {}),
    ...(x.contrat ? { signataire: { nom: x.contrat.signer.name, fonction: x.contrat.signer.title } } : {}),
    creeLe: jour(p.createdAt),
  }
}

/** Avatars de la carte projet : souscripteur en retard en rouge. */
export const apercuDepuis = (enrollments: Enrollment[]) =>
  enrollments.slice(0, 2).map(e => ({ nom: `${e.member.firstName} ${e.member.lastName}`.trim(), ...(e.standing === 'late' ? { ton: 'danger' as const } : {}) }))

/** Inscription → souscription (+ souscripteur) de l'interface. */
export function vueSouscription(e: Enrollment, associationId: string): SouscriptionAvecSouscripteur {
  return {
    id: e.id,
    souscripteurId: e.member.id,
    projetId: e.projectId,
    inscritLe: jour(e.joinedAt),
    ...(e.status === 'pending_signature' ? { contratId: e.id } : {}),
    ...(e.contractSignedAt ? { contratSigneLe: jour(e.contractSignedAt), contratId: e.id } : {}),
    verse: m(e.paid),
    reste: m(e.remaining),
    engagement: mOu(e.commitment, m(e.paid) + m(e.remaining)),
    statut: SITUATION[e.standing]!,
    montantEnRetard: m(e.lateAmount),
    ...(e.withdrawnAt ? { retireLe: jour(e.withdrawnAt) } : {}),
    souscripteur: {
      id: e.member.id, prenom: e.member.firstName, nom: e.member.lastName, telephone: tel(e.member.phone),
      ...(e.member.email ? { email: email(e.member.email) } : {}), associationIds: [associationId], membreDepuis: jour(e.joinedAt),
    },
  }
}

type Grille = CallOutput<'lg.grid', 'get'>

/** Grille du projet : une ligne par souscripteur, ses échéances dans l'ordre. */
export function vueGrille(g: Grille, souscriptions: SouscriptionAvecSouscripteur[], projetId: string): LigneGrilleProjet[] {
  return g.items.flatMap((row) => {
    const sc = souscriptions.find(s => s.id === row.enrollmentId)
    if (!sc) return []
    const { souscripteur, ...souscription } = sc
    const echeances: Echeance[] = row.cells.map((c) => {
      const col = g.columns.find(x => x.sequence === c.sequence)!
      return {
        id: c.installmentId, projetId, souscripteurId: row.member.id, rang: c.sequence, estFondsEntree: col.kind === 'entry_fee',
        date: col.dueDate, montant: c.amountDue.amount, montantPaye: c.amountPaid.amount, statut: STATUT_ECHEANCE[c.status]!,
        ...(ECHEANCE_FERMEE(c.status) ? { fermee: true } : {}),
      }
    })
    return [{ souscription, souscripteur, echeances }]
  })
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const moisDe = (d: string) => MOIS[Number(d.slice(5, 7)) - 1]!

type Synthese = CallOutput<'pr.overview', 'get'>

/** Vue d'ensemble d'un projet (MgProjet). `aujourdhui` : mois en cours marqué « en cours ». */
export function vueSynthese(o: Synthese, aujourdhui: string): SyntheseProjet {
  const nom = (p: { firstName: string, lastName: string }) => `${p.firstName} ${p.lastName}`.trim()
  return {
    retardataires: o.lateMembers.map(l => ({ souscripteurId: l.member.id, nom: nom(l.member), nbEcheances: l.lateInstallments, montant: l.amountDue.amount, mois: l.lateDueDates.map(moisDe) })),
    paiementsAValider: { nombre: o.paymentsToReview.count, ...(o.paymentsToReview.oldestDeclaredAt ? { plusAncienLe: jour(o.paymentsToReview.oldestDeclaredAt) } : {}) },
    contratsNonSignes: o.unsignedContracts.map(c => ({ souscripteurId: c.member.id, nom: nom(c.member), inscritLe: jour(c.enrolledAt) })),
    collecte: o.collectionBySequence.map(c => ({ mois: c.dueDate, attendu: c.expected.amount, recu: c.received.amount, enCours: c.dueDate.slice(0, 7) === aujourdhui.slice(0, 7) })),
  }
}

type Rapport = CallOutput<'rp.report', 'get'>

/** Rapport d'un projet (MgProjetRapports) ; une signature attendue n'a ni attendu ni reste. */
export function vueRapport(r: Rapport, enAttente: Set<string>): RapportProjet {
  return {
    lignes: r.rows.map((x) => {
      const attente = enAttente.has(x.member.id)
      return {
        souscripteurId: x.member.id, nom: `${x.member.firstName} ${x.member.lastName}`.trim(),
        attenduADate: attente ? null : x.expectedToDate.amount, verse: x.paid.amount, reste: attente ? null : x.remaining.amount,
        retards: x.lateCount, ...(x.lastPaymentOn ? { dernierPaiement: x.lastPaymentOn } : {}),
      }
    }),
    tauxParEcheance: r.recoveryRateBySequence.map(t => ({ mois: t.dueDate, taux: Math.round(t.rate * 100) })),
    statuts: { aJour: r.standingCounts.up_to_date ?? 0, enRetard: r.standingCounts.late ?? 0, signature: r.standingCounts.signature_required ?? 0 },
  }
}

const FREQUENCES = { weekly: 'hebdomadaires', monthly: 'mensuelles', quarterly: 'trimestrielles', semiannual: 'semestrielles', annual: 'annuelles' } as const

/** Modèle de contrat avec les valeurs du projet ; `{nom_souscripteur}` et `{telephone}` restent pour chaque souscripteur. */
export function rendreModele(modele: string, p: ProjectSummary, association: string): string {
  const F = (n: number) => formatMoney({ amount: n, currency: 'XOF' })
  const valeurs: Record<string, string> = {
    association, projet: p.name, montant: p.stats.totalPerSubscriber ? F(p.stats.totalPerSubscriber.amount) : '[MONTANT]',
    fonds_entree: F(p.entryFee?.amount ?? 0), nb_echeances: String(p.stats.installmentsCount ?? '[N]'), frequence: FREQUENCES[p.frequency],
    montant_echeance: F(p.installmentAmount.amount), jour: String(p.dueDay),
  }
  return modele.replace(/\{(\w+)\}/g, (tout, cle: string) => valeurs[cle] ?? tout)
}

type ContratGestionnaire = CallOutput<'ct.get', 'get'>

export function vueContratProjet(c: ContratGestionnaire, p: ProjectSummary, association: { name: string, city: string }): ContratProjet {
  return {
    association: { nom: association.name, ville: association.city },
    texte: rendreModele(c.bodyTemplate, p, association.name),
    ...(c.associationSignedAt ? { signataire: { nom: c.signer.name, fonction: c.signer.title, signeLe: jour(c.associationSignedAt) } } : {}),
    signes: c.signatures.signed,
    total: c.signatures.total,
    nonSignataires: c.unsigned.map(u => ({ souscripteurId: u.member.id, nom: `${u.member.firstName} ${u.member.lastName}`.trim(), inscritLe: jour(u.enrolledAt) })),
  }
}
