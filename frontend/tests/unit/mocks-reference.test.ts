// Jeu simulé (server/mocks) : identique à docs/specs/seed-reference.yaml, échéances générées par @cotiz/domain,
// chiffres des tableaux de bord retrouvés par calcul (lot 0.3, étape 2).
import { readFileSync } from 'node:fs'
import { generateSchedule } from '@cotiz/domain'
import { beforeEach, describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { ID, uid } from '../../server/mocks/ids'
import { SEED } from '../../server/mocks/reference'
import { db, resetDb } from '../../server/mocks/db'
import { UNLISTED } from '../../server/mocks/db/seed'
import {
  associationFigures, daysSince, enrollmentFigures, installmentsOf, memberStandingIn, projectFigures, scheduleFrom,
  subscriberTotals,
} from '../../server/mocks/ledger'

const yaml = parse(readFileSync(new URL('../../../docs/specs/seed-reference.yaml', import.meta.url), 'utf8'))
const enrollment = (project: string, user: string) => db.enrollments.find(e => e.projectId === project && e.userId === user)!
const project = (id: string) => db.projects.find(p => p.id === id)!

beforeEach(() => resetDb())

describe('jeu de référence', () => {
  it('reprend seed-reference.yaml à l’identique', () => {
    expect(JSON.parse(JSON.stringify(SEED))).toEqual(stripNotes(yaml))
  })

  it('identifiants : UUID déterministes, distincts par type', () => {
    expect(uid('project', 'centre-communautaire')).toBe(ID.centre)
    expect(ID.centre).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(uid('user', 'centre-communautaire')).not.toBe(ID.centre)
  })

  it('les échéances viennent de generateSchedule() (Centre communautaire : fonds d’entrée + 18 mensualités)', () => {
    const centre = project(ID.centre)
    const lignes = installmentsOf(enrollment(ID.centre, ID.moussa).id)
    const attendu = generateSchedule({
      installmentAmount: 25000, entryFeeAmount: 50000, frequency: 'monthly', dueDay: 5, scheduleType: 'fixed',
      startDate: centre.startDate, endDate: centre.endDate,
    })
    expect(lignes.map(l => [l.sequence, l.kind, l.dueDate, l.amountDue])).toEqual(attendu.map(l => [l.sequence, l.kind, l.dueDate, l.amountDue]))
    expect(attendu.filter(l => l.kind === 'periodic')).toHaveLength(18)
  })

  it('aucune échéance avant la signature (Fatou Traoré, Moussa sur Voyage solidaire)', () => {
    expect(installmentsOf(enrollment(ID.centre, uid('user', 'fatou-traore')).id)).toEqual([])
    expect(installmentsOf(enrollment(ID.voyage, ID.moussa).id)).toEqual([])
  })
})

describe('Moussa Diarra (tableau de bord souscripteur)', () => {
  it('Centre communautaire : 175 000 F versés, reste 325 000 F, août et septembre en retard (50 000 F)', () => {
    const f = enrollmentFigures(enrollment(ID.centre, ID.moussa))
    expect(f.paid).toBe(175000)
    expect(f.remaining).toBe(325000)
    expect(f.commitment).toBe(500000)
    expect(f.lateAmount).toBe(50000)
    expect(f.lateDueDates).toEqual(['2026-08-05', '2026-09-05'])
    expect(f.standing).toBe('late')
  })

  it('reste total, retard, projets, associations et prochaine échéance = expected.subscriberDashboard_moussa', () => {
    const attendu = SEED.expected.subscriberDashboard_moussa
    const t = subscriberTotals(ID.moussa)
    expect(t.remainingTotal).toBe(attendu.remainingTotal)
    expect(t.late).toEqual({ count: 2, amount: attendu.lateAmount })
    expect(t.projectsCount).toBe(attendu.projects)
    expect(t.associationsCount).toBe(attendu.associations)
    // Le 5 octobre, Centre (25 000 F) et Mutuelle (10 000 F) : la plus grosse échéance l'emporte.
    expect(t.nextDue).toMatchObject({ dueDate: attendu.nextDue.date, amount: attendu.nextDue.amount })
    expect(t.nextDue!.enrollment.projectId).toBe(ID.centre)
  })

  it('la prochaine échéance ignore une échéance couverte par une déclaration (Awa Koné : 5 décembre)', () => {
    expect(enrollmentFigures(enrollment(ID.centre, ID.awa)).nextDue).toEqual({ dueDate: '2026-12-05', amount: 25000 })
  })
})

describe('tableau de bord gestionnaire (Entraide Yopougon)', () => {
  it('reproduit expected.managerDashboard', () => {
    const attendu = SEED.expected.managerDashboard
    const f = associationFigures(ID.entraide)
    expect(f.collectedThisMonth).toBe(attendu.collectedThisMonth)
    expect(f.expectedThisMonth).toBe(attendu.expectedThisMonth)
    expect(f.pendingPaymentsCount).toBe(attendu.paymentsToReview)
    expect(daysSince(f.oldestPendingAt!)).toBe(attendu.oldestPendingDays)
    expect(f.lateMembersCount).toBe(attendu.lateSubscribers)
    expect(f.membersCount).toBe(attendu.totalSubscribers)
    expect(Math.round(f.recoveryRate! * 100)).toBe(Math.round(attendu.recoveryRate * 100))
  })

  it('Centre communautaire : 52 souscripteurs, 9 594 000 F collectés sur 11 700 000 F (82 %), 4 paiements à valider', () => {
    const f = projectFigures(project(ID.centre))
    expect(f.subscribersCount).toBe(52)
    expect(f.collected).toBe(9_594_000)
    expect(f.expectedToDate).toBe(11_700_000)
    expect(Math.round(f.recoveryRate! * 100)).toBe(82)
    expect(Math.round(f.progress! * 100)).toBe(37)
    expect(f.pendingPaymentsCount).toBe(4)
    expect(f.pendingSignaturesCount).toBe(1)
    expect(f.nextDueDate).toBe('2026-10-05')
    expect(f).toMatchObject({ installmentsCount: 18, totalPerSubscriber: 500000 })
  })

  it('annuaire : versé, reste et situation des souscripteurs nommés (DONNEES-REFERENCE)', () => {
    const ligne = (key: string) => {
      const f = enrollmentFigures(enrollment(ID.centre, uid('user', key)))
      return [f.paid, f.remaining, memberStandingIn(ID.entraide, uid('user', key))]
    }
    expect(ligne('moussa-diarra')).toEqual([175000, 325000, 'late'])
    expect(ligne('koffi-brou')).toEqual([175000, 325000, 'late'])
    expect(ligne('awa-kone')).toEqual([200000, 300000, 'up_to_date'])
    expect(ligne('kadiatou-sanogo')).toEqual([200000, 300000, 'up_to_date'])
    // Solde d'août déclaré : l'échéance est « déclarée », plus « en retard » (domain-rules § 6, écart R9).
    expect(ligne('jean-kouassi')).toEqual([212500, 287500, 'up_to_date'])
    // Signature attendue, entrée en septembre : engagement depuis son entrée (écart R9).
    expect(ligne('fatou-traore')).toEqual([0, 350000, 'signature_required'])
  })

  it('Voyage solidaire : entrées en septembre, engagement depuis l’entrée (écart R9)', () => {
    const ligne = (key: string) => {
      const f = enrollmentFigures(enrollment(ID.voyage, uid('user', key)))
      return [f.paid, f.remaining, f.standing]
    }
    expect(ligne('ibrahim-toure')).toEqual([0, 130000, 'up_to_date'])
    expect(ligne('adjoua-yao')).toEqual([0, 130000, 'up_to_date'])
    expect(ligne('moussa-diarra')).toEqual([0, 130000, 'signature_required'])
  })
})

describe('compléments non nommés : réalisables', () => {
  for (const u of UNLISTED.filter(x => x.scope === 'project')) {
    const p = db.projects.find(x => x.id === u.scopeId)!
    it(`${p.name} : chaque agrégat tient dans ce que ${u.members} souscripteurs entrés au début peuvent devoir`, () => {
      const lignes = scheduleFrom(p)
      const parSouscripteur = lignes.filter(l => l.dueDate <= SEED.today).reduce((t, l) => t + l.amountDue, 0)
      const ceMois = lignes.filter(l => l.dueDate.slice(0, 7) === SEED.today.slice(0, 7)).reduce((t, l) => t + l.amountDue, 0)
      expect(u.activeMembers).toBeLessThanOrEqual(u.members)
      expect(u.late).toBeLessThanOrEqual(u.activeMembers)
      expect(u.expectedToDate).toBeLessThanOrEqual(u.activeMembers * parSouscripteur)
      expect(u.collected).toBeLessThanOrEqual(u.expectedToDate)
      expect(u.lateAmount).toBe(u.expectedToDate - u.collected)
      expect(u.lateAmount).toBeGreaterThanOrEqual(u.late * p.installmentAmount)
      expect(u.expectedThisMonth).toBe(u.activeMembers * ceMois)
      for (const m of [u.collected, u.expectedToDate, u.collectedThisMonth, u.expectedThisMonth, u.lateAmount]) expect(Number.isSafeInteger(m)).toBe(true)
    })
  }
})

/** Le YAML porte des notes libres (`note`) absentes de la copie TypeScript. */
function stripNotes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripNotes)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'note').map(([k, v]) => [k, stripNotes(v)]))
  }
  return value
}
