// Scénarios de dev (`?scenario=` propagé par le front) : états de données de design/INVENTAIRE.md.
// Chaque scénario d'état transforme une COPIE du jeu, le temps d'une requête : les mutations réelles ne sont jamais
// perturbées et tous les endpoints d'une page voient le même état. Les scénarios propres à une liste (`vide`…)
// sont traités dans l'implémentation de l'endpoint.
import { db } from './db'
import type { MockDb, PaymentRow } from './db'
import { ID, uid } from './ids'
import { scheduleFrom } from './ledger'
import { enrollmentId, installmentId } from './db/seed'

type Transform = (d: MockDb) => void

const markPaid = (d: MockDb, filter: (i: MockDb['installments'][number]) => boolean) => {
  for (const i of d.installments.filter(filter)) {
    i.amountPaid = i.amountDue
    i.paidAt ??= `${i.dueDate}T10:00:00Z`
  }
}

/** Échéances en retard au jour du jeu (sans dépendre des statuts calculés). */
const isLate = (d: MockDb, i: MockDb['installments'][number]) => {
  const p = d.projects.find(x => x.id === i.projectId)!
  const graceEnd = new Date(Date.parse(`${i.dueDate}T00:00:00Z`) + (p.graceDays + 1) * 86_400_000).toISOString().slice(0, 10)
  const pending = d.allocations.some(a => a.installmentId === i.id && a.state === 'proposed')
  return i.amountPaid < i.amountDue && !pending && d.today >= graceEnd
}

function noLate(d: MockDb) {
  markPaid(d, i => isLate(d, i))
  for (const u of d.unlisted) Object.assign(u, { late: 0, collected: u.expectedToDate, lateAmount: 0 })
}

/** Retire des projets et tout ce qui en dépend (inscriptions, échéances, paiements, contrats). */
function removeProjects(d: MockDb, keep: (p: MockDb['projects'][number]) => boolean) {
  d.projects = d.projects.filter(keep)
  const ids = new Set(d.projects.map(p => p.id))
  d.enrollments = d.enrollments.filter(e => ids.has(e.projectId))
  d.installments = d.installments.filter(i => ids.has(i.projectId))
  d.payments = d.payments.filter(p => ids.has(p.projectId))
  const payments = new Set(d.payments.map(p => p.id))
  d.allocations = d.allocations.filter(a => payments.has(a.paymentId))
  d.contracts = d.contracts.filter(c => ids.has(c.projectId))
  d.unlisted = d.unlisted.filter(u => u.scope !== 'project' || ids.has(u.scopeId))
}

function noPending(d: MockDb) {
  const pending = new Set(d.payments.filter(p => p.status === 'pending').map(p => p.id))
  d.payments = d.payments.filter(p => !pending.has(p.id))
  d.allocations = d.allocations.filter(a => !pending.has(a.paymentId))
}

/** Signature d'une inscription : active, échéancier généré depuis sa date d'entrée (décision 20). */
export function signEnrollment(d: MockDb, enrollment: MockDb['enrollments'][number], at: string) {
  const project = d.projects.find(p => p.id === enrollment.projectId)!
  enrollment.status = 'active'
  enrollment.contractSignedAt = at
  if (d.installments.some(i => i.enrollmentId === enrollment.id)) return
  // Identifiant par inscription : une réinscription après un retrait ne réutilise pas les échéances du retrait.
  for (const l of scheduleFrom(project, enrollment.startsFrom)) {
    d.installments.push({
      id: uid('installment', `${enrollment.id}:${l.sequence}`), enrollmentId: enrollment.id, projectId: project.id, kind: l.kind,
      sequence: l.sequence, dueDate: l.dueDate, amountDue: l.amountDue, amountPaid: 0, persistedStatus: 'open', paidAt: null,
    })
  }
}

function allSigned(d: MockDb) {
  for (const e of d.enrollments.filter(x => x.status === 'pending_signature')) signEnrollment(d, e, '2026-09-24T10:00:00Z')
}

/** Paiement de Moussa ajouté par un scénario de MbAccueil / MbProjet : août et septembre de Centre, 50 000 F. */
function moussaPayment(d: MockDb, status: PaymentRow['status'], declaredAt: string) {
  const id = uid('payment', `scenario-${status}`)
  d.payments.push({
    id, associationId: ID.entraide, projectId: ID.centre, enrollmentId: enrollmentId('centre-communautaire', 'moussa-diarra'),
    userId: ID.moussa, amountDeclared: 50000, amountReceived: null, paidOn: declaredAt.slice(0, 10), paymentMethodId: null,
    paymentMethodKind: 'mobile_money', proof: { fileId: null, fileName: null, mimeType: null, transactionReference: '[RÉFÉRENCE]' },
    comment: null, status, declaredAt,
    reviewedBy: status === 'pending' ? null : ID.aminata, reviewedAt: status === 'pending' ? null : `${declaredAt.slice(0, 10)}T15:00:00Z`,
    rejection: status === 'rejected' ? { reasonCode: 'unreadable_proof', message: null } : null, allocationAdjusted: false,
    declaredAllocations: [6, 7].map(seq => ({ installmentId: installmentId('centre-communautaire', 'moussa-diarra', seq), amount: 25000 })), version: 1,
  })
  for (const seq of [6, 7]) {
    d.allocations.push({ paymentId: id, installmentId: installmentId('centre-communautaire', 'moussa-diarra', seq), amount: 25000, state: status === 'pending' ? 'proposed' : status === 'validated' ? 'confirmed' : 'voided' })
  }
  if (status === 'validated') markPaid(d, i => i.enrollmentId === enrollmentId('centre-communautaire', 'moussa-diarra') && (i.sequence === 6 || i.sequence === 7))
}

/** Séquences de la maquette « beaucoup de retards » (MgProjetPaiements) : `o` payée, `l` impayée. */
function manyLate(d: MockDb) {
  const seqs: Record<string, string> = { 'kadiatou-sanogo': 'oooolllW', 'serge-gnagne': 'ooooollW' }
  for (const [key, seq] of Object.entries(seqs)) {
    const eid = enrollmentId('centre-communautaire', key)
    for (const i of d.installments.filter(x => x.enrollmentId === eid)) {
      const c = seq[i.sequence]
      if (c === 'o') i.amountPaid = i.amountDue
      if (c === 'l') Object.assign(i, { amountPaid: 0, paidAt: null })
    }
  }
}

export const SCENARIO_TRANSFORMS: Record<string, Transform> = {
  'aucun-retard': noLate,
  'termine': (d) => {
    const centre = d.projects.find(p => p.id === ID.centre)!
    Object.assign(centre, { status: 'completed', closedAt: '2027-08-31T18:00:00Z' })
    markPaid(d, i => i.projectId === ID.centre)
    noPending(d)
    const u = d.unlisted.find(x => x.scopeId === ID.centre)
    if (u) Object.assign(u, { late: 0, collected: u.members * 500000, expectedToDate: u.members * 500000, lateAmount: 0 })
  },
  'tous-signes': allSigned,
  'tout-signe': allSigned,
  'consultation': allSigned,
  'beaucoup-de-retards': manyLate,
  'a-jour': d => moussaPayment(d, 'validated', '2026-09-20T09:00:00Z'),
  'tout-est-paye': (d) => {
    moussaPayment(d, 'validated', '2026-09-20T09:00:00Z')
    d.enrollments = d.enrollments.filter(e => !(e.userId === ID.moussa && e.status === 'pending_signature'))
  },
  'paiement-en-attente': d => moussaPayment(d, 'pending', '2026-09-25T09:00:00Z'),
  'paiement-rejete': d => moussaPayment(d, 'rejected', '2026-09-20T09:00:00Z'),
  'file-vide': noPending,
  'tout-est-a-jour': (d) => {
    noPending(d)
    noLate(d)
    allSigned(d)
  },
  'aucun-paiement': (d) => {
    d.payments = []
    d.allocations = []
  },
  'une-seule-association': (d) => {
    d.enrollments = d.enrollments.filter(e => !(e.userId === ID.moussa && e.projectId === ID.mutuelle))
    d.memberships = d.memberships.filter(m => !(m.userId === ID.moussa && m.associationId === ID.man))
  },
  // Projets : aucun projet dans l'association (gestionnaire) ni aucune inscription (souscripteur).
  'aucun-projet': (d) => {
    removeProjects(d, p => p.associationId !== ID.entraide)
    d.enrollments = d.enrollments.filter(e => e.userId !== ID.moussa)
  },
  'premier-usage': d => removeProjects(d, p => p.associationId !== ID.entraide),
  // Preuve de la maquette MgPaiement : reçu PDF, ou référence seule.
  'pdf': (d) => {
    const p = d.payments.find(x => x.id === uid('payment', 'pm-awa-kone'))
    if (p) p.proof = { fileId: uid('file', 'pm-awa-kone'), fileName: 'recu_orange_money.pdf', mimeType: 'application/pdf', transactionReference: null }
  },
  'reference-seule': (d) => {
    const p = d.payments.find(x => x.id === uid('payment', 'pm-awa-kone'))
    if (p) p.proof = { fileId: null, fileName: null, mimeType: null, transactionReference: 'OM-260922-[XXXX]' }
  },
  // Équipe : 3 comptes secondaires sur 3.
  'quota-atteint': (d) => {
    const key = 'gestionnaire-nouveau'
    d.users.push({ id: uid('user', key), key, firstName: '[Nouveau gestionnaire]', lastName: '', phone: null, email: 'nouveau@entraide.example', status: 'pending_activation', locale: 'fr-CI', address: null, city: null, passwordChangedAt: null, lastLoginAt: null, version: 1 })
    d.memberships.push({ associationId: ID.entraide, userId: uid('user', key), role: 'manager', status: 'invited', title: null, joinedAt: '2026-09-24T09:00:00Z' })
  },
}

/** Exécute `fn` sur une copie du jeu transformée par le scénario (synchrone : aucune autre requête ne s'intercale). */
export function withScenario<T>(scenario: string | undefined, fn: () => T): T {
  const transform = scenario ? SCENARIO_TRANSFORMS[scenario] : undefined
  if (!transform) return fn()
  const original = { ...db }
  const copy = structuredClone(original)
  transform(copy)
  Object.assign(db, copy)
  try {
    const out = fn()
    if (out instanceof Promise) throw new Error('Les implémentations simulées doivent être synchrones')
    return out
  }
  finally {
    Object.assign(db, original)
  }
}
