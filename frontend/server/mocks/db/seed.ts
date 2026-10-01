// Construction du jeu simulé à partir du jeu de référence (mocks/reference.ts = docs/specs/seed-reference.yaml)
// et des valeurs affichées dans les maquettes (design/DONNEES-REFERENCE.md, blocs renderVals()).
// Échéances : generateSchedule() de @cotiz/domain ; aucun montant d'échéance n'est écrit à la main.
// Placeholders : un champ nullable vaut `null` (le front affiche le placeholder) ; un champ obligatoire du contrat
// prend la valeur du jeu de référence, sinon une valeur calculée ou une adresse réservée `.example` (RFC 2606),
// décisions de docs/specs/v0-mapping.md § 1 et § 6.
import { generateSchedule } from '@cotiz/domain'
import { uid } from '../ids'
import { SEED } from '../reference'
import type {
  ActivationCodeRow, AllocationRow, AssociationRow, ContractRow, EnrollmentRow, EventRow, InstallmentRow, InvoiceRow,
  MembershipRow, MockDb, NotificationRow, PaymentMethodRow, PaymentRow, PlanRow, PreferenceRow, ProjectRow,
  ReminderRuleRow, ReminderRunRow, RequestRow, StaffRow, SubscriptionRow, UnlistedRow, UserRow,
} from './types'

const at = (date: string, time = '09:00') => `${date}T${time}:00Z`
const seedPlan = (code: string) => SEED.plans.find(p => p.code === code)!
const seedProject = (key: string) => SEED.projects.find(p => p.key === key)!
const seedPerson = (key: string) => SEED.people.find(p => p.key === key)!

// ---------------------------------------------------------------- Plans
// Prix annuel : la grille ne fixe que le mensuel (seed-reference) ; annuel = 12 × mensuel faute de tarif annuel.
function plans(): PlanRow[] {
  const P = (code: string, o: Pick<PlanRow, 'description' | 'features' | 'isFeatured' | 'subscribersCount'>): PlanRow => {
    const s = seedPlan(code)
    return {
      id: uid('plan', code), code, name: s.name, priceMonthly: s.priceMonthly, priceYearly: s.priceMonthly * 12,
      limits: { projects: s.maxProjects, subscribers: s.maxSubscribers, managers: s.maxManagers },
      isActive: true, archivedAt: null, version: 1, ...o,
    }
  }
  return [
    P('decouverte', { description: null, features: ['payments'], isFeatured: false, subscribersCount: 41 }),
    P('essentiel', {
      description: 'Pour les associations qui gèrent plusieurs projets.',
      features: ['payments', 'contracts', 'auto_reminders'], isFeatured: true, subscribersCount: 78,
    }),
    P('pro', { description: null, features: ['payments', 'contracts', 'auto_reminders', 'imports', 'analytics'], isFeatured: false, subscribersCount: 28 }),
  ]
}

// ---------------------------------------------------------------- Personnes
interface Person { key: string, firstName: string, lastName: string, phone?: string | null, email?: string | null, status?: UserRow['status'], address?: string | null, city?: string | null }

const PEOPLE: Person[] = [
  { ...pick('awa'), key: 'awa-kone', address: 'Yopougon, Abidjan' },
  { ...pick('aminata'), key: 'aminata-konate' },
  { ...pick('moussa'), key: 'moussa-diarra', address: 'Yopougon, Abidjan' },
  { ...pick('fatou'), key: 'fatou-traore', status: 'pending_activation', address: 'Yopougon, Abidjan' },
  { ...pick('jean'), key: 'jean-kouassi' },
  { ...pick('richy'), key: 'richy', lastName: '[Nom]' },
  // Souscripteurs des listes des maquettes (DONNEES-REFERENCE « autres souscripteurs ») : téléphone non fourni.
  { key: 'koffi-brou', firstName: 'Koffi', lastName: 'Brou' },
  { key: 'kadiatou-sanogo', firstName: 'Kadiatou', lastName: 'Sanogo' },
  { key: 'serge-gnagne', firstName: 'Serge', lastName: 'Gnagne' },
  // Numéro de démonstration de la recherche « compte existant » (server/mocks/IDENTIFIANTS.md).
  { key: 'ibrahim-toure', firstName: 'Ibrahim', lastName: 'Touré', phone: '+2250100000001' },
  { key: 'adjoua-yao', firstName: 'Adjoua', lastName: 'Yao' },
  { key: 'mariam-diallo', firstName: 'Mariam', lastName: 'Diallo' },
  { key: 'yves-ahoussou', firstName: 'Yves', lastName: 'Ahoussou' },
  { key: 'clarisse-aka', firstName: 'Clarisse', lastName: 'Aka' },
  { key: 'aicha-bamba', firstName: 'Aïcha', lastName: 'Bamba' },
  // Gestionnaires sans nom dans les maquettes.
  { key: 'responsable-man', firstName: '[Responsable]', lastName: '' },
  { key: 'responsable-bouake', firstName: '[Responsable]', lastName: '' },
  { key: 'gestionnaire-invite', firstName: '[Gestionnaire invité]', lastName: '', email: 'invitation@entraide.example', status: 'pending_activation' },
  // Équipe plateforme (aperçu V2).
  { key: 'staff-admin', firstName: '[Membre de l’équipe]', lastName: '', email: 'admin@cotiz.example' },
  { key: 'staff-support', firstName: '[Membre de l’équipe]', lastName: '', email: 'support@cotiz.example', status: 'pending_activation' },
]

function pick(key: string): Person {
  const p = seedPerson(key) as { firstName: string, lastName?: string, phone?: string, email?: string }
  return { key, firstName: p.firstName, lastName: p.lastName ?? '', phone: p.phone ?? null, email: p.email ?? null }
}

function users(): UserRow[] {
  return PEOPLE.map(p => ({
    id: uid('user', p.key), key: p.key, firstName: p.firstName, lastName: p.lastName, phone: p.phone ?? null,
    email: p.email ?? null, status: p.status ?? 'active', locale: 'fr-CI', address: p.address ?? null, city: p.city ?? null,
    passwordChangedAt: null, lastLoginAt: null, version: 1,
  }))
}

const U = (key: string) => uid('user', key)
const A = (key: string) => uid('association', key)

// ---------------------------------------------------------------- Associations
function associations(): AssociationRow[] {
  const base = (key: string): Pick<AssociationRow, 'id' | 'slug' | 'name' | 'city' | 'status' | 'planId'> => {
    const s = SEED.associations.find(a => a.key === key)!
    return { id: A(key), slug: key, name: s.name, city: s.city, status: s.status as AssociationRow['status'], planId: uid('plan', s.plan) }
  }
  const common = { type: 'association', country: 'Côte d’Ivoire', logoFileId: null, currency: 'XOF', timezone: 'Africa/Abidjan', defaultGraceDays: 5, suspendedAt: null, suspensionReason: null, statusBeforeSuspension: null, version: 1 } as const
  return [
    {
      ...base('entraide-yopougon'), ...common, description: 'Entraide entre familles du quartier de Yopougon.',
      contactEmail: 'awa@entraide.ci', contactPhone: '+2250708091011', onboardingCompletedAt: at('2024-02-03'),
      managerSeatsOverride: 3, createdAt: at('2024-02-03'), lastActivityAt: at('2026-09-25'),
    },
    {
      ...base('ressortissants-man'), ...common, description: null,
      contactEmail: 'contact@ressortissants-man.example', contactPhone: '+2250700000000', onboardingCompletedAt: at('2025-01-14'),
      managerSeatsOverride: null, createdAt: at('2025-01-14'), lastActivityAt: at('2026-09-23'),
    },
    {
      ...base('jeunesse-bouake'), ...common, description: null,
      contactEmail: 'contact@jeunesse-bouake.example', contactPhone: '+2250700000001', onboardingCompletedAt: null,
      managerSeatsOverride: null, createdAt: at('2026-09-20'), lastActivityAt: at('2026-09-24'),
    },
  ]
}

function paymentMethods(): PaymentMethodRow[] {
  const entraide = SEED.associations[0].paymentMethods.map((m, i): PaymentMethodRow => ({
    id: uid('payment-method', `entraide-${i}`), associationId: A('entraide-yopougon'), kind: m.kind, label: m.label,
    details: { ...m.details }, instructions: i === 1 ? 'Indiquez votre nom et « Centre » en référence du virement.' : null,
    position: i, isActive: true,
  }))
  return [
    ...entraide,
    // Ressortissants de Man : mobile money, numéro et opérateur non fournis (placeholders conservés dans `details`).
    { id: uid('payment-method', 'man-0'), associationId: A('ressortissants-man'), kind: 'mobile_money', label: '[Opérateur]', details: { operator: '[Opérateur]', number: '+225 [XX XX XX XX]' }, instructions: null, position: 0, isActive: true },
  ]
}

function subscriptions(): SubscriptionRow[] {
  return [
    { id: uid('subscription', 'entraide'), associationId: A('entraide-yopougon'), planId: uid('plan', 'essentiel'), billingPeriod: 'monthly', status: 'active', currentPeriodStart: '2026-09-01', currentPeriodEnd: '2026-09-30', trialEndsOn: null },
    { id: uid('subscription', 'man'), associationId: A('ressortissants-man'), planId: uid('plan', 'pro'), billingPeriod: 'monthly', status: 'past_due', currentPeriodStart: '2026-09-01', currentPeriodEnd: '2026-09-30', trialEndsOn: null },
    { id: uid('subscription', 'bouake'), associationId: A('jeunesse-bouake'), planId: uid('plan', 'decouverte'), billingPeriod: 'monthly', status: 'trialing', currentPeriodStart: '2026-09-24', currentPeriodEnd: '2026-09-30', trialEndsOn: null },
  ]
}

function invoices(): InvoiceRow[] {
  const price = (code: string) => seedPlan(code).priceMonthly
  const I = (key: string, assoc: string, plan: string, number: string, month: string, status: InvoiceRow['status'], issued: string | null, paid: string | null): InvoiceRow => ({
    id: uid('invoice', key), associationId: A(assoc), number, periodStart: `${month}-01`, periodEnd: `${month}-${month.endsWith('09') ? '30' : month.endsWith('02') ? '28' : '31'}`,
    amount: price(plan), status, issuedAt: issued ? at(issued) : null, dueAt: issued ? at(`${month}-05`) : null, paidAt: paid ? at(paid) : null, paymentReference: null,
  })
  return [
    I('f-0112', 'ressortissants-man', 'pro', 'F-2026-09-0112', '2026-09', 'overdue', '2026-09-01', null),
    I('frm-08', 'ressortissants-man', 'pro', '[N° FACTURE]', '2026-08', 'paid', '2026-08-01', '2026-08-04'),
    I('frm-07', 'ressortissants-man', 'pro', '[N° FACTURE]', '2026-07', 'paid', '2026-07-01', '2026-07-04'),
    I('f-0087', 'entraide-yopougon', 'essentiel', 'F-2026-09-0087', '2026-09', 'paid', '2026-09-01', '2026-09-04'),
    I('fey-08', 'entraide-yopougon', 'essentiel', '[N° FACTURE]', '2026-08', 'paid', '2026-08-01', '2026-08-04'),
    I('fey-07', 'entraide-yopougon', 'essentiel', '[N° FACTURE]', '2026-07', 'paid', '2026-07-01', '2026-07-04'),
    I('f-0002', 'entraide-yopougon', 'essentiel', 'F-2026-10-0002', '2026-10', 'open', '2026-09-25', null),
    I('f-0001', 'jeunesse-bouake', 'decouverte', 'F-2026-10-0001', '2026-10', 'draft', null, null),
  ]
}

function memberships(): MembershipRow[] {
  const E = A('entraide-yopougon')
  const M = (associationId: string, key: string, role: MembershipRow['role'], o: Partial<MembershipRow> = {}): MembershipRow =>
    ({ associationId, userId: U(key), role, status: 'active', title: null, joinedAt: at('2024-02-03'), ...o })
  const subscribers = ['moussa-diarra', 'koffi-brou', 'jean-kouassi', 'fatou-traore', 'awa-kone', 'kadiatou-sanogo', 'serge-gnagne', 'ibrahim-toure', 'adjoua-yao', 'mariam-diallo', 'yves-ahoussou', 'clarisse-aka', 'aicha-bamba']
  return [
    M(E, 'awa-kone', 'owner', { title: 'trésorière' }),
    M(E, 'serge-gnagne', 'manager'),
    M(E, 'gestionnaire-invite', 'manager', { status: 'invited', joinedAt: at('2026-09-20') }),
    // A validé des paiements, mais n'apparaît pas dans l'écran Équipe de la maquette : accès retiré depuis.
    M(E, 'aminata-konate', 'manager', { status: 'removed' }),
    M(A('ressortissants-man'), 'responsable-man', 'owner', { joinedAt: at('2025-01-14') }),
    M(A('jeunesse-bouake'), 'responsable-bouake', 'owner', { joinedAt: at('2026-09-24') }),
    ...subscribers.map(k => M(E, k, 'subscriber', { joinedAt: at(k === 'fatou-traore' ? '2026-09-02' : k === 'moussa-diarra' ? '2024-02-03' : '2026-03-12') })),
    M(A('ressortissants-man'), 'moussa-diarra', 'subscriber', { joinedAt: at('2026-07-01') }),
  ]
}

function staff(): StaffRow[] {
  return [
    { userId: U('richy'), role: 'owner', status: 'active' },
    { userId: U('staff-admin'), role: 'admin', status: 'active' },
    { userId: U('staff-support'), role: 'support', status: 'invited' },
  ]
}

// ---------------------------------------------------------------- Projets
const CONTRACT_TEMPLATE = [
  '**Entre** l’association {association}, et **{nom_souscripteur}**, souscripteur, joignable au {telephone}.',
  '**Article 1 — Objet.** Le souscripteur s’engage à participer au financement du projet {projet}.',
  '**Article 2 — Montant.** La participation totale est de {montant} CFA : un fonds d’entrée de {fonds_entree}, puis {nb_echeances} échéances {frequence} de {montant_echeance}, payables le {jour} de chaque mois.',
  '**Article 3 — Paiement.** Les versements sont effectués par mobile money ou virement, puis déclarés sur Cotiz. Un paiement n’est acquis qu’après validation par l’association.',
  '**Article 4 — Retard.** [CONDITIONS EN CAS DE RETARD DÉFINIES PAR L’ASSOCIATION]',
  '**Article 5 — Résiliation.** [CONDITIONS DE RÉSILIATION DÉFINIES PAR L’ASSOCIATION]',
].join('\n\n')

function projects(pms: PaymentMethodRow[]): ProjectRow[] {
  const pm = (i: number, instructions: string | null = null) => ({ paymentMethodId: pms[i]!.id, instructionsOverride: instructions })
  const P = (key: string, o: Partial<ProjectRow> & Pick<ProjectRow, 'associationId' | 'createdAt'>): ProjectRow => {
    const s = seedProject(key) as Record<string, unknown> & { name: string, status: ProjectRow['status'] }
    return {
      id: uid('project', key), key, name: s.name, description: '', coverFileId: null, coverFileName: null, status: s.status,
      scheduleType: s.scheduleType as ProjectRow['scheduleType'], entryFee: (s.entryFeeAmount as number | undefined) ?? null,
      installmentAmount: s.installmentAmount as number, frequency: s.frequency as ProjectRow['frequency'], dueDay: s.dueDay as number,
      startDate: s.startDate as string, endDate: (s.endDate as string | undefined) ?? null,
      requiredSubscribers: (s.requiredSubscribers as number | undefined) ?? null, graceDays: (s.graceDays as number | undefined) ?? 5,
      paymentMethods: [], contractRequired: Boolean(s.contractRequired), financialTermsLockedAt: null, closedAt: null, version: 1, ...o,
    }
  }
  const E = A('entraide-yopougon')
  return [
    P('centre-communautaire', {
      associationId: E, createdAt: at('2026-03-01'), financialTermsLockedAt: at('2026-03-06'), contractRequired: true,
      description: 'Construction d’un centre communautaire pour les familles du quartier.',
      coverFileId: uid('file', 'couverture-centre'), coverFileName: 'couverture_centre.jpg', requiredSubscribers: 60,
      paymentMethods: [pm(1, 'Indiquez votre nom et « Centre » en référence du virement.'), pm(0, 'Indiquez votre nom et « Centre » en référence du virement.')],
    }),
    P('tontine-2027', { associationId: E, createdAt: at('2026-09-01'), paymentMethods: [pm(0)] }),
    P('voyage-solidaire', { associationId: E, createdAt: at('2026-05-20'), financialTermsLockedAt: at('2026-06-06'), paymentMethods: [pm(0), pm(1)] }),
    P('mutuelle-sante', {
      associationId: A('ressortissants-man'), createdAt: at('2026-06-15'), financialTermsLockedAt: at('2026-07-06'),
      contractRequired: true, paymentMethods: [{ paymentMethodId: uid('payment-method', 'man-0'), instructionsOverride: null }],
    }),
  ]
}

// ---------------------------------------------------------------- Inscriptions et échéances
// Situation de chaque souscripteur nommé, une lettre par échéance depuis le fonds d'entrée (codes de la maquette,
// MgProjetPaiements.dc.html) : `o` payée · `P` payée à moitié · `l`, `W`, `f` rien de payé. Les paiements en attente
// (`W`) sont des paiements déclarés (paymentsPending) : leur statut « déclarée » est calculé, jamais écrit.
interface EnrollmentSeed { project: string, user: string, status: EnrollmentRow['status'], joined: string, signed: string | null, paid: string, startsFrom?: string }

const ENROLLMENTS: EnrollmentSeed[] = [
  // Centre communautaire (projet de référence).
  { project: 'centre-communautaire', user: 'moussa-diarra', status: 'active', joined: '2026-03-12', signed: '2026-03-12', paid: 'oooooo' },
  { project: 'centre-communautaire', user: 'koffi-brou', status: 'active', joined: '2026-03-14', signed: '2026-03-14', paid: 'oooooo' },
  { project: 'centre-communautaire', user: 'jean-kouassi', status: 'active', joined: '2026-03-12', signed: '2026-03-12', paid: 'ooooooPo' },
  { project: 'centre-communautaire', user: 'fatou-traore', status: 'pending_signature', joined: '2026-09-02', signed: null, paid: '', startsFrom: '2026-09-02' },
  { project: 'centre-communautaire', user: 'awa-kone', status: 'active', joined: '2026-03-12', signed: '2026-03-12', paid: 'ooooooo' },
  { project: 'centre-communautaire', user: 'kadiatou-sanogo', status: 'active', joined: '2026-03-20', signed: '2026-03-20', paid: 'ooooooo' },
  { project: 'centre-communautaire', user: 'serge-gnagne', status: 'active', joined: '2026-04-02', signed: '2026-04-02', paid: 'ooooooo' },
  { project: 'centre-communautaire', user: 'mariam-diallo', status: 'active', joined: '2026-03-12', signed: '2026-03-12', paid: 'ooooooo' },
  { project: 'centre-communautaire', user: 'yves-ahoussou', status: 'active', joined: '2026-03-12', signed: '2026-03-12', paid: 'ooooooo' },
  { project: 'centre-communautaire', user: 'clarisse-aka', status: 'active', joined: '2026-03-12', signed: '2026-03-12', paid: 'ooooooo' },
  // Tontine solidaire 2027 (inscriptions ouvertes, cycle roulant).
  { project: 'tontine-2027', user: 'kadiatou-sanogo', status: 'active', joined: '2026-09-10', signed: null, paid: '' },
  // Voyage solidaire.
  { project: 'voyage-solidaire', user: 'moussa-diarra', status: 'pending_signature', joined: '2026-09-18', signed: null, paid: '', startsFrom: '2026-09-18' },
  // Entré en septembre (après le 5) : aucune échéance due ce mois-ci, son premier versement entame le fonds d'entrée.
  { project: 'voyage-solidaire', user: 'ibrahim-toure', status: 'active', joined: '2026-09-15', signed: '2026-09-15', paid: '', startsFrom: '2026-09-15' },
  { project: 'voyage-solidaire', user: 'adjoua-yao', status: 'active', joined: '2026-09-20', signed: '2026-09-21', paid: '', startsFrom: '2026-09-20' },
  // Mutuelle santé (Ressortissants de Man) : fonds d'entrée, juillet, août, septembre payés.
  { project: 'mutuelle-sante', user: 'moussa-diarra', status: 'active', joined: '2026-07-01', signed: '2026-07-01', paid: 'oooo' },
]

export const enrollmentId = (project: string, user: string) => uid('enrollment', `${project}:${user}`)
export const installmentId = (project: string, user: string, sequence: number) => uid('installment', `${project}:${user}:${sequence}`)

function ledger(projectRows: ProjectRow[]): { enrollments: EnrollmentRow[], installments: InstallmentRow[] } {
  const enrollments: EnrollmentRow[] = []
  const installments: InstallmentRow[] = []
  for (const e of ENROLLMENTS) {
    const project = projectRows.find(p => p.key === e.project)!
    const id = enrollmentId(e.project, e.user)
    const startsFrom = e.startsFrom ?? project.startDate
    enrollments.push({ id, projectId: project.id, userId: U(e.user), status: e.status, startsFrom, joinedAt: at(e.joined), contractSignedAt: e.signed ? at(e.signed) : null, withdrawnAt: null })
    // Échéancier généré à la signature (architecture/04-flows.md) : rien tant que la signature est attendue.
    if (e.status === 'pending_signature') continue
    const lines = generateSchedule({
      installmentAmount: project.installmentAmount, entryFeeAmount: project.entryFee, frequency: project.frequency,
      dueDay: project.dueDay, scheduleType: project.scheduleType, startDate: project.startDate, endDate: project.endDate,
      enrolledFrom: startsFrom,
    })
    lines.forEach((l, i) => {
      const code = e.paid[i]
      // `P` : moitié payée, arrondie à l'entier inférieur (montants entiers, jamais de fraction).
      const amountPaid = code === 'o' ? l.amountDue : code === 'P' ? Math.floor(l.amountDue / 2) : 0
      installments.push({
        id: installmentId(e.project, e.user, l.sequence), enrollmentId: id, projectId: project.id, kind: l.kind,
        sequence: l.sequence, dueDate: l.dueDate, amountDue: l.amountDue, amountPaid, persistedStatus: 'open',
        paidAt: amountPaid === l.amountDue ? at(l.dueDate, '10:00') : null,
      })
    })
  }
  return { enrollments, installments }
}

// ---------------------------------------------------------------- Paiements
// Paiements visibles dans les maquettes : file de validation (6 en attente), paiements validés de la vue liste
// et des rapports, historique de Moussa. Leurs montants sont déjà comptés dans `amountPaid` (situation ci-dessus).
interface PaymentSeed {
  key: string
  project: string
  user: string
  amount: number
  declared: string
  method: 'mobile_money' | 'bank_transfer'
  covers: [number, number][]
  status: PaymentRow['status']
  reviewed?: string
  by?: string
  proof?: Partial<PaymentRow['proof']>
}

const REF = '[RÉFÉRENCE]'
const PAYMENTS: PaymentSeed[] = [
  // File de validation : « il y a 3 j », « il y a 2 j » ×2, « hier » ×2, « aujourd'hui » (25 septembre).
  { key: 'pm-awa-kone', project: 'centre-communautaire', user: 'awa-kone', amount: 75000, declared: '2026-09-22T10:41', method: 'mobile_money', covers: [[7, 25000], [8, 25000], [9, 25000]], status: 'pending', proof: { fileName: 'capture_mobile_money.jpg', mimeType: 'image/jpeg' } },
  { key: 'pm-jean-kouassi', project: 'centre-communautaire', user: 'jean-kouassi', amount: 12500, declared: '2026-09-23T08:15', method: 'mobile_money', covers: [[6, 12500]], status: 'pending', proof: { transactionReference: REF } },
  { key: 'pm-kadiatou-sanogo', project: 'centre-communautaire', user: 'kadiatou-sanogo', amount: 25000, declared: '2026-09-23T14:02', method: 'bank_transfer', covers: [[7, 25000]], status: 'pending', proof: { fileName: 'recu_banque.pdf', mimeType: 'application/pdf' } },
  { key: 'pm-serge-gnagne', project: 'centre-communautaire', user: 'serge-gnagne', amount: 25000, declared: '2026-09-24T09:30', method: 'mobile_money', covers: [[7, 25000]], status: 'pending', proof: { fileName: '[FICHIER]', mimeType: 'image/jpeg' } },
  { key: 'pm-ibrahim-toure', project: 'voyage-solidaire', user: 'ibrahim-toure', amount: 10000, declared: '2026-09-24T18:05', method: 'mobile_money', covers: [[0, 10000]], status: 'pending', proof: { fileName: '[FICHIER]', mimeType: 'image/jpeg' } },
  { key: 'pm-adjoua-yao', project: 'voyage-solidaire', user: 'adjoua-yao', amount: 50000, declared: '2026-09-25T08:20', method: 'bank_transfer', covers: [[0, 50000]], status: 'pending', proof: { fileName: '[FICHIER]', mimeType: 'image/jpeg' } },
  // Validés (MgProjetPaiements vue liste, MgProjetRapports) par Aminata Konaté.
  { key: 'pm-jk-09', project: 'centre-communautaire', user: 'jean-kouassi', amount: 37500, declared: '2026-09-06T09:00', method: 'mobile_money', covers: [[7, 25000], [6, 12500]], status: 'validated', reviewed: '2026-09-06T15:00', by: 'aminata-konate' },
  { key: 'pm-ak-08', project: 'centre-communautaire', user: 'awa-kone', amount: 25000, declared: '2026-08-05T09:00', method: 'mobile_money', covers: [[6, 25000]], status: 'validated', reviewed: '2026-08-05T15:00', by: 'aminata-konate' },
  { key: 'pm-kb-07', project: 'centre-communautaire', user: 'koffi-brou', amount: 25000, declared: '2026-07-04T09:00', method: 'mobile_money', covers: [[5, 25000]], status: 'validated', reviewed: '2026-07-05T10:00', by: 'aminata-konate' },
  // Historique de Moussa Diarra (MbHistorique).
  { key: 'pm-md-09-m', project: 'mutuelle-sante', user: 'moussa-diarra', amount: 10000, declared: '2026-09-05T08:00', method: 'mobile_money', covers: [[3, 10000]], status: 'validated', reviewed: '2026-09-06T09:00', by: 'responsable-man' },
  { key: 'pm-md-08-m', project: 'mutuelle-sante', user: 'moussa-diarra', amount: 10000, declared: '2026-08-05T08:00', method: 'mobile_money', covers: [[2, 10000]], status: 'validated', reviewed: '2026-08-06T09:00', by: 'responsable-man' },
  { key: 'pm-md-07-c', project: 'centre-communautaire', user: 'moussa-diarra', amount: 25000, declared: '2026-07-05T08:00', method: 'mobile_money', covers: [[5, 25000]], status: 'validated', reviewed: '2026-07-07T09:00', by: 'aminata-konate' },
  { key: 'pm-md-07-m', project: 'mutuelle-sante', user: 'moussa-diarra', amount: 30000, declared: '2026-07-05T08:30', method: 'mobile_money', covers: [[0, 20000], [1, 10000]], status: 'validated', reviewed: '2026-07-06T09:00', by: 'responsable-man' },
  { key: 'pm-md-06-c', project: 'centre-communautaire', user: 'moussa-diarra', amount: 25000, declared: '2026-06-05T08:00', method: 'mobile_money', covers: [[4, 25000]], status: 'validated', reviewed: '2026-06-06T09:00', by: 'aminata-konate' },
  { key: 'pm-md-05-c', project: 'centre-communautaire', user: 'moussa-diarra', amount: 25000, declared: '2026-05-05T08:00', method: 'mobile_money', covers: [[3, 25000]], status: 'validated', reviewed: '2026-05-06T09:00', by: 'aminata-konate' },
  { key: 'pm-md-04-c', project: 'centre-communautaire', user: 'moussa-diarra', amount: 25000, declared: '2026-04-05T08:00', method: 'mobile_money', covers: [[2, 25000]], status: 'validated', reviewed: '2026-04-07T09:00', by: 'aminata-konate' },
  { key: 'pm-md-03-c', project: 'centre-communautaire', user: 'moussa-diarra', amount: 75000, declared: '2026-03-05T08:00', method: 'mobile_money', covers: [[0, 50000], [1, 25000]], status: 'validated', reviewed: '2026-03-06T09:00', by: 'aminata-konate' },
]

function payments(projectRows: ProjectRow[], pms: PaymentMethodRow[]): { payments: PaymentRow[], allocations: AllocationRow[] } {
  const rows: PaymentRow[] = []
  const allocations: AllocationRow[] = []
  for (const p of PAYMENTS) {
    const project = projectRows.find(x => x.key === p.project)!
    const id = uid('payment', p.key)
    const method = pms.find(m => m.associationId === project.associationId && m.kind === p.method) ?? null
    rows.push({
      id, associationId: project.associationId, projectId: project.id, enrollmentId: enrollmentId(p.project, p.user), userId: U(p.user),
      amountDeclared: p.amount, amountReceived: null, paidOn: p.declared.slice(0, 10), paymentMethodId: method?.id ?? null,
      paymentMethodKind: p.method,
      proof: { fileId: p.proof?.fileName ? uid('file', p.key) : null, fileName: null, mimeType: null, transactionReference: p.proof?.fileName ? null : REF, ...p.proof },
      comment: null, status: p.status, declaredAt: `${p.declared}:00Z`, reviewedBy: p.by ? U(p.by) : null,
      reviewedAt: p.reviewed ? `${p.reviewed}:00Z` : null, rejection: null, allocationAdjusted: false, version: 1,
    })
    for (const [sequence, amount] of p.covers) {
      allocations.push({ paymentId: id, installmentId: installmentId(p.project, p.user, sequence), amount, state: p.status === 'pending' ? 'proposed' : 'confirmed' })
    }
  }
  return { payments: rows, allocations }
}

// ---------------------------------------------------------------- Contrats
function contracts(projectRows: ProjectRow[]): ContractRow[] {
  const signed = (key: string, date: string | null, by: string | null): ContractRow => ({
    id: uid('contract', key), projectId: projectRows.find(p => p.key === key)!.id, bodyTemplate: CONTRACT_TEMPLATE,
    signerName: by === 'awa-kone' ? 'Awa Koné' : '[SIGNATAIRE]', signerTitle: by === 'awa-kone' ? 'trésorière' : '[FONCTION]',
    associationSignedAt: date ? at(date) : null, associationSignedBy: by ? U(by) : null, lockedAt: date ? at(date) : null,
    createdAt: at(date ?? '2026-09-01'),
  })
  return [
    signed('centre-communautaire', '2026-03-01', 'awa-kone'),
    signed('voyage-solidaire', '2026-05-20', 'awa-kone'),
    signed('tontine-2027', null, null),
    signed('mutuelle-sante', '2026-06-15', 'responsable-man'),
  ]
}

// ---------------------------------------------------------------- Notifications
function notifications(): NotificationRow[] {
  const N = (key: string, user: string, assoc: string | null, type: string, title: string, body: string, createdAt: string, read: boolean, actionUrl: string, actionLabel: string): NotificationRow => ({
    id: uid('notification', key), userId: U(user), associationId: assoc ? A(assoc) : null, type, title, body, actionUrl, actionLabel,
    readAt: read ? createdAt : null, createdAt,
  })
  const E = 'entraide-yopougon'
  return [
    N('nt-mb-1', 'moussa-diarra', E, 'contract.to_sign', 'Contrat à signer', 'Entraide Yopougon vous invite à signer le contrat du projet Voyage solidaire.', '2026-09-25T09:12:00Z', false, `/projets/${uid('project', 'voyage-solidaire')}/contrat`, 'Signer le contrat'),
    N('nt-mb-2', 'moussa-diarra', E, 'installment.late', 'Échéances en retard', 'Centre communautaire : 50 000 F en retard (août et septembre).', '2026-09-25T08:00:00Z', false, `/paiements/declarer?projet=${uid('project', 'centre-communautaire')}`, 'Régulariser'),
    N('nt-mb-3', 'moussa-diarra', E, 'installment.due_soon', 'Rappel d’échéance', 'Prochaine échéance le 5 octobre : 25 000 F pour Centre communautaire.', '2026-09-21T09:00:00Z', true, `/projets/${uid('project', 'centre-communautaire')}`, 'Voir le projet'),
    N('nt-mb-4', 'moussa-diarra', 'ressortissants-man', 'payment.validated', 'Paiement validé', 'Vos 10 000 F pour Mutuelle santé ont été validés.', '2026-09-06T09:00:00Z', true, '/historique', 'Voir l’historique'),
    N('nt-mb-5', 'moussa-diarra', 'ressortissants-man', 'payment.validated', 'Paiement validé', 'Vos 10 000 F pour Mutuelle santé ont été validés.', '2026-08-06T09:00:00Z', true, '/historique', 'Voir l’historique'),
    N('nt-mb-6', 'moussa-diarra', E, 'payment.validated', 'Paiement validé', 'Vos 25 000 F pour Centre communautaire ont été validés.', '2026-07-07T09:00:00Z', true, '/historique', 'Voir l’historique'),
    N('nt-mg-1', 'awa-kone', E, 'payment.declared', 'Nouvelle déclaration de paiement', 'Moussa Diarra a déclaré 75 000 F pour Centre communautaire (août, septembre, octobre).', '2026-09-25T10:41:00Z', false, '/asso/paiements', 'Vérifier et valider'),
    N('nt-mg-2', 'awa-kone', E, 'payment.declared', '6 paiements à valider', 'Dont 4 sur Centre communautaire.', '2026-09-25T08:00:00Z', false, '/asso/paiements', 'Ouvrir la file de validation'),
    N('nt-mg-3', 'awa-kone', E, 'reminder.sent', 'Relance automatique envoyée', 'Règle « 15 jours de retard » : 14 souscripteurs relancés sur Centre communautaire.', '2026-09-25T07:30:00Z', false, '/asso/relances', 'Voir les retardataires'),
    N('nt-mg-4', 'awa-kone', E, 'contract.signed', 'Contrat signé', '[Souscripteur] a signé le contrat Voyage solidaire.', '2026-09-22T09:00:00Z', true, '/asso/contrats', 'Voir les contrats'),
    N('nt-mg-5', 'awa-kone', E, 'contract.to_sign', 'Contrat non signé', 'Fatou Traoré n’a pas encore signé le contrat Centre communautaire.', '2026-09-21T09:00:00Z', true, `/asso/souscripteurs/${U('fatou-traore')}`, 'Voir le souscripteur'),
    N('nt-mg-6', 'awa-kone', E, 'billing.invoice', 'Facture d’abonnement disponible', 'Facture [N° FACTURE] · formule Essentiel.', '2026-09-01T09:00:00Z', true, '/asso/abonnement', 'Voir l’abonnement'),
    N('nt-mg-7', 'awa-kone', E, 'payment.validated', 'Paiement validé par Serge Gnagne', 'Jean Kouassi · 12 500 F · Centre communautaire.', '2026-09-01T08:00:00Z', true, '/asso/paiements', 'Voir le paiement'),
  ]
}

// ---------------------------------------------------------------- Demandes de création
function requests(): RequestRow[] {
  const R = (key: string, name: string, type: string, contact: [string, string, string], city: string, estimated: RequestRow['needs']['estimatedSubscribers'], plan: string, received: string, status: RequestRow['status'], o: Partial<RequestRow> = {}): RequestRow => ({
    id: uid('request', key), key, reference: '[RÉFÉRENCE]', status,
    association: { name, type, city, country: 'Côte d’Ivoire', registrationNumber: null, activityDescription: '[DESCRIPTION]' },
    contact: { firstName: contact[0], lastName: contact[1], title: '[FONCTION]', email: contact[2], phone: '+2250700000000' },
    needs: { estimatedSubscribers: estimated, plannedProjects: null, desiredPlanId: uid('plan', plan), acquisitionSource: '[SOURCE]' },
    termsAcceptedAt: at(received), createdAt: at(received), viewedAt: null, viewedBy: null,
    decidedAt: status === 'pending' ? null : at(received, '15:00'), decidedBy: status === 'pending' ? null : U('richy'),
    rejectionReasonCode: status === 'rejected' ? 'incomplete' : null, rejectionMessage: null, internalNote: null,
    associationId: status === 'approved' ? A(key) : null, approvedPlanId: status === 'approved' ? uid('plan', plan) : null, ...o,
  })
  const responsable: [string, string, string] = ['[Responsable]', '', 'responsable@domaine.example']
  return [
    R('tontine-commercantes-adjame', 'Tontine des commerçantes d’Adjamé', 'tontine', ['Mariam', 'Ouattara', 'm.ouattara@domaine.example'], 'Abidjan', '51_200', 'essentiel', '2026-09-21', 'pending', {
      reference: '[RÉF. DEMANDE]', createdAt: '2026-09-21T10:14:00Z', termsAcceptedAt: '2026-09-21T10:14:00Z',
      viewedAt: '2026-09-25T09:02:00Z', viewedBy: U('richy'),
      association: { name: 'Tontine des commerçantes d’Adjamé', type: 'tontine', city: 'Abidjan', country: 'Côte d’Ivoire', registrationNumber: null, activityDescription: '[Description de l’activité saisie par le demandeur — 500 caractères maximum.]' },
      contact: { firstName: 'Mariam', lastName: 'Ouattara', title: 'Présidente', email: 'm.ouattara@domaine.example', phone: '+2250700000000' },
      needs: { estimatedSubscribers: '51_200', plannedProjects: 2, desiredPlanId: uid('plan', 'essentiel'), acquisitionSource: 'Une autre association' },
    }),
    R('mutuelle-enseignants-daloa', 'Mutuelle des enseignants de Daloa', 'mutuelle', ['Koffi', 'N’Guessan', 'k.nguessan@domaine.example'], 'Daloa', '201_500', 'pro', '2026-09-22', 'pending'),
    R('groupement-femmes-korhogo', 'Groupement des femmes de Korhogo', 'groupement', ['Salimata', 'Coulibaly', 's.coulibaly@domaine.example'], 'Korhogo', '21_50', 'decouverte', '2026-09-23', 'pending'),
    R('etudiants-yamoussoukro', 'Association des étudiants de Yamoussoukro', 'association', ['Yao', 'Kouamé', 'y.kouame@domaine.example'], 'Yamoussoukro', '51_200', 'decouverte', '2026-09-24', 'pending'),
    R('jeunesse-bouake', 'Jeunesse solidaire de Bouaké', 'association', responsable, 'Bouaké', '21_50', 'decouverte', '2026-09-20', 'approved', { decidedAt: '2026-09-24T09:00:00Z' }),
    R('ressortissants-man', 'Association des ressortissants de Man', 'association', responsable, 'Abidjan', '51_200', 'pro', '2025-01-14', 'approved'),
    R('entraide-yopougon', 'Entraide Yopougon', 'association', ['Awa', 'Koné', 'awa@entraide.ci'], 'Abidjan', '51_200', 'decouverte', '2024-02-03', 'approved'),
    R('amis-grand-bassam', 'Club des amis de Grand-Bassam', 'association', responsable, 'Grand-Bassam', '1_20', 'decouverte', '2026-09-11', 'rejected'),
  ]
}

// ---------------------------------------------------------------- Relances
function reminderRules(): ReminderRuleRow[] {
  const E = A('entraide-yopougon')
  const R = (key: string, trigger: ReminderRuleRow['trigger'], offsetDays: number, message: string): ReminderRuleRow => ({
    id: uid('reminder-rule', key), associationId: E, projectId: null, trigger, offsetDays, channels: ['in_app', 'push'], message, isActive: true, createdAt: at('2026-03-01'),
  })
  return [
    R('avant-3j', 'before_due', 3, 'Rappel doux : montant et date de la prochaine échéance'),
    R('jour-j', 'on_due', 0, 'Si aucun paiement n’a été déclaré'),
    R('retard-7j', 'after_due', 7, 'Signale le retard et le montant dû'),
    R('retard-15j', 'after_due', 15, 'Relance ferme, copie au gestionnaire'),
  ]
}

function reminderRuns(): ReminderRunRow[] {
  const E = A('entraide-yopougon')
  const C = uid('project', 'centre-communautaire')
  const run = (key: string, atIso: string, kind: ReminderRunRow['kind'], user: string, o: Partial<ReminderRunRow> = {}): ReminderRunRow => ({
    id: uid('reminder-run', key), associationId: E, at: atIso, kind, status: kind === 'automatic' ? 'auto_sent' : 'handled', userId: U(user),
    projectId: C, installmentId: null, channels: ['in_app'], message: null, triggeredBy: null, ruleId: null, ...o,
  })
  const r15 = uid('reminder-rule', 'retard-15j')
  return [
    run('auto-0920-moussa', '2026-09-20T07:30:00Z', 'automatic', 'moussa-diarra', { ruleId: r15 }),
    run('auto-0920-koffi', '2026-09-20T07:30:00Z', 'automatic', 'koffi-brou', { ruleId: r15 }),
    run('auto-0920-mariam', '2026-09-20T07:30:00Z', 'automatic', 'mariam-diallo', { ruleId: r15 }),
    run('man-0912-jean', '2026-09-12T10:00:00Z', 'manual', 'jean-kouassi', { triggeredBy: U('awa-kone') }),
    // Relance de la frise de la fiche (MgSouscripteur), sans règle associée dans la maquette.
    run('auto-0910-moussa', '2026-09-10T07:30:00Z', 'automatic', 'moussa-diarra', { installmentId: installmentId('centre-communautaire', 'moussa-diarra', 7) }),
    run('man-0810-moussa', '2026-08-10T10:00:00Z', 'manual', 'moussa-diarra', { triggeredBy: U('awa-kone'), installmentId: installmentId('centre-communautaire', 'moussa-diarra', 6) }),
  ]
}

// ---------------------------------------------------------------- Codes d'activation, préférences, frises
function activationCodes(): ActivationCodeRow[] {
  return [{ id: uid('activation-code', 'fatou'), associationId: A('entraide-yopougon'), userId: U('fatou-traore'), code: 'K7M4-P9QX', issuedAt: at('2026-09-02'), expiresAt: at('2026-10-02'), handedAt: null }]
}

function preferences(): PreferenceRow[] {
  const P = (user: string, type: string, enabled: boolean): PreferenceRow => ({ userId: U(user), type, channel: 'in_app', enabled })
  return [
    P('awa-kone', 'payment.declared', true), P('awa-kone', 'contract.signed', true), P('awa-kone', 'digest.daily', false),
    P('richy', 'request.received', true), P('richy', 'subscription.past_due', true), P('richy', 'association.created', false), P('richy', 'digest.weekly', true),
  ]
}

function events(): EventRow[] {
  const E = (key: string, scopeId: string, atIso: string, type: string, title: string, detail: string | null, tone: EventRow['tone']): EventRow =>
    ({ id: key, scope: 'association', scopeId: A(scopeId), associationId: A(scopeId), at: atIso, type, title, detail, tone, projectId: null, by: null })
  return [
    E('ev-ey-1', 'entraide-yopougon', '2025-06-01T09:00:00Z', 'plan.changed', 'Changement de plan', 'Découverte → Essentiel', 'brand'),
    E('ev-ey-2', 'entraide-yopougon', '2024-06-10T09:00:00Z', 'manager.added', 'Gestionnaire ajoutée', 'Aminata Konaté', 'success'),
    E('ev-ey-3', 'entraide-yopougon', '2024-02-03T09:00:00Z', 'association.created', 'Espace créé', 'Février 2024', 'info'),
    E('ev-rm-1', 'ressortissants-man', '2026-09-05T09:00:00Z', 'subscription.past_due', 'Abonnement impayé', '5 sept. 2026', 'warning'),
    E('ev-rm-2', 'ressortissants-man', '2025-06-01T09:00:00Z', 'plan.changed', 'Passage au plan Pro', '[DATE]', 'success'),
    E('ev-rm-3', 'ressortissants-man', '2025-01-14T09:00:00Z', 'association.created', 'Espace créé', 'Janvier 2025', 'info'),
    E('ev-jb-1', 'jeunesse-bouake', '2026-09-24T10:00:00Z', 'onboarding.in_progress', 'Onboarding en cours', 'Étape 2 sur 4', 'info'),
    E('ev-jb-2', 'jeunesse-bouake', '2026-09-24T09:00:00Z', 'request.approved', 'Demande approuvée', '24 sept. 2026 · par Richy', 'success'),
  ]
}

// ---------------------------------------------------------------- Compléments non nommés
// Écart entre les compteurs des maquettes et les souscripteurs nommés : agrégats ajoutés aux calculs, jamais listés.
// Centre communautaire (cibles DONNEES-REFERENCE / seed-reference `expected`) : 52 souscripteurs engagés dont 9 nommés
// (Fatou Traoré, signature attendue, est comptée à part) → 43 non nommés, tous entrés en mars :
//   attendu à date 43 × 225 000 = 9 675 000 F (total 11 700 000 F) ;
//   collecté 9 594 000 − 1 762 500 (nommés) = 7 831 500 F (82 % au total) ;
//   en retard 14 − 5 (nommés) = 9, dont le manque est entièrement en retard : 9 675 000 − 7 831 500 = 1 843 500 F ;
//   septembre : attendu 43 × 25 000 = 1 075 000 F (total 1 300 000 F), reçu (paiements validés en septembre)
//   1 240 000 − 37 500 (Jean Kouassi, 6 septembre) = 1 202 500 F, rattrapages compris.
// Invariants de faisabilité vérifiés par tests/unit/mocks-reference.test.ts.
export const UNLISTED: UnlistedRow[] = [
  { scope: 'project', scopeId: uid('project', 'centre-communautaire'), members: 43, activeMembers: 43, late: 9, collected: 7_831_500, expectedToDate: 9_675_000, collectedThisMonth: 1_202_500, expectedThisMonth: 1_075_000, lateAmount: 1_843_500 },
  // Tontine : 12 inscrits sur 30 dont Kadiatou Sanogo ; cycle qui démarre en janvier 2027 (rien d'attendu).
  { scope: 'project', scopeId: uid('project', 'tontine-2027'), members: 11, activeMembers: 11, late: 0, collected: 0, expectedToDate: 0, collectedThisMonth: 0, expectedThisMonth: 0, lateAmount: 0 },
  // Annuaire de l'association : « 52 membres » dont 13 nommés.
  { scope: 'association', scopeId: A('entraide-yopougon'), members: 39, activeMembers: 39, late: 0, collected: 0, expectedToDate: 0, collectedThisMonth: 0, expectedThisMonth: 0, lateAmount: 0 },
  { scope: 'association', scopeId: A('ressortissants-man'), members: 141, activeMembers: 141, late: 0, collected: 0, expectedToDate: 0, collectedThisMonth: 0, expectedThisMonth: 0, lateAmount: 0 },
]

// ---------------------------------------------------------------- Assemblage
export function buildDb(): MockDb {
  const pms = paymentMethods()
  const projectRows = projects(pms)
  const { enrollments, installments } = ledger(projectRows)
  const { payments: paymentRows, allocations } = payments(projectRows, pms)
  return {
    today: SEED.today,
    plans: plans(),
    associations: associations(),
    paymentMethods: pms,
    subscriptions: subscriptions(),
    invoices: invoices(),
    users: users(),
    memberships: memberships(),
    staff: staff(),
    projects: projectRows,
    enrollments,
    installments,
    payments: paymentRows,
    allocations,
    contracts: contracts(projectRows),
    notifications: notifications(),
    requests: requests(),
    reminderRules: reminderRules(),
    reminderRuns: reminderRuns(),
    activationCodes: activationCodes(),
    preferences: preferences(),
    events: events(),
    unlisted: structuredClone(UNLISTED),
    // Maquettes : toutes les fonctionnalités visibles, sauf les aperçus « Bientôt disponible » de la V0
    // (facturation globale, personnel plateforme, graphiques avancés des rapports).
    features: ['payments', 'activation_codes', 'password_reset_manual', 'realtime', 'web_push', 'contracts', 'imports', 'auto_reminders', 'team', 'exports', 'usage_stats', 'mfa'],
    permissions: {
      platform: ['authenticated', 'platform.requests.manage', 'platform.associations.read', 'platform.associations.manage', 'platform.plans.manage', 'platform.billing.manage', 'platform.staff.manage', 'platform.audit.read'],
      association: ['authenticated', 'association.read', 'association.settings.manage', 'association.team.manage', 'projects.manage', 'members.manage', 'payments.review', 'reminders.send', 'reports.read', 'reports.export'],
      subscriber: ['authenticated', 'subscriber.self'],
    },
  }
}
