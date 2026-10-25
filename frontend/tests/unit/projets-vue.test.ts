// Projet du contrat → projet de l'interface (paramètres) : moyens de paiement retenus (lot 2.2, Q7 : liste vide = moyens
// actifs de l'association).
import type { PaymentMethod, Project } from '@cotiz/contracts'
import { describe, expect, it } from 'vitest'
import { vueProjet } from '~/composables/api/vues/projets'

const xof = (amount: number) => ({ amount, currency: 'XOF' as const })
const id = (n: number) => `00000000-0000-7000-8000-00000000000${n}`

const PROJET: Project = {
  id: id(1), name: 'Centre communautaire', description: '', coverFileId: null, coverFileName: null, status: 'active',
  requiredSubscribers: 60, graceDays: 5, entryFee: xof(50000), installmentAmount: xof(25000), frequency: 'monthly', dueDay: 5,
  scheduleType: 'fixed', startDate: '2026-03-01', endDate: '2027-08-31', paymentMethods: [],
  financialTermsLockedAt: null, closedAt: null, createdAt: '2026-03-01T09:00:00Z', version: 1,
  stats: {
    subscribersCount: 0, collected: xof(0), expectedToDate: xof(0), recoveryRate: null, progress: null, lateSubscribersCount: 0,
    pendingPaymentsCount: 0, pendingSignaturesCount: 0, nextDueDate: null, installmentsCount: 18, totalPerSubscriber: xof(500000),
  },
}

const MOYENS = [
  { id: id(2), kind: 'bank_transfer', label: 'SGBCI', details: { iban: 'CI93 CI00 8011 1234 5678 9012 34' }, instructions: null, isActive: true, position: 0 },
  { id: id(3), kind: 'mobile_money', label: 'Orange Money', details: { operator: 'orange', number: '+2250708091011' }, instructions: null, isActive: true, position: 1 },
  { id: id(4), kind: 'cash', label: 'Espèces', details: {}, instructions: 'Au trésorier', isActive: false, position: 2 },
] as unknown as PaymentMethod[]

const moyensDe = (p: Project) => vueProjet(p, { associationId: id(9), moyens: MOYENS }).modalitesPaiement.map(m => m.moyen)

describe('vueProjet : moyens de paiement', () => {
  it('aucun moyen propre : moyens actifs de l’association', () => {
    expect(moyensDe(PROJET)).toEqual(['virement', 'mobile_money'])
  })

  it('moyens propres : ceux-là seulement', () => {
    expect(moyensDe({ ...PROJET, paymentMethods: [{ paymentMethodId: id(3), instructionsOverride: null }] })).toEqual(['mobile_money'])
  })

  it('résumé de liste (sans moyens) : aucun', () => {
    const { description: _d, paymentMethods: _m, ...resume } = PROJET
    expect(vueProjet(resume, { associationId: id(9), moyens: MOYENS }).modalitesPaiement).toEqual([])
  })
})
