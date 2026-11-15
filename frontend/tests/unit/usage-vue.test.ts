import { describe, expect, it } from 'vitest'
import { decalerJours, periodeUsage, vueUsage } from '~/composables/api/vues/usage'

const jour = (day: string, v: Partial<{ logins: number, declared: number, validated: number, hours: number }> = {}) => ({
  day,
  logins: v.logins ?? 0,
  activeUsers: 0,
  paymentsDeclared: v.declared ?? 0,
  paymentsValidated: v.validated ?? 0,
  avgValidationHours: v.hours ?? 0,
})

describe('vueUsage — onglet Usage (pf.asso.usage, lot 4.6)', () => {
  it('période : 6 mois du 1er du mois, jusqu’à la veille', () => {
    expect(periodeUsage('2026-11-14')).toEqual({ from: '2026-06-01', to: '2026-11-14' })
    expect(periodeUsage('2026-03-31')).toEqual({ from: '2025-10-01', to: '2026-03-31' })
    expect(decalerJours('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('connexions : 30 jours jusqu’à la veille, 0 pour un jour absent', () => {
    const vue = vueUsage([jour('2026-11-14', { logins: 3 }), jour('2026-10-16', { logins: 2 }), jour('2026-10-15', { logins: 9 })], periodeUsage('2026-11-14'))
    expect(vue.connexions).toHaveLength(30)
    expect(vue.connexions[0]).toEqual({ jour: '2026-10-16', valeur: 2 })
    expect(vue.connexions.at(-1)).toEqual({ jour: '2026-11-14', valeur: 3 })
    expect(vue.totalConnexions).toBe(5)
    expect(vue.calcule).toBe(true)
  })

  it('paiements par mois et délai moyen pondéré par les validations des 30 jours', () => {
    const vue = vueUsage([
      jour('2026-11-14', { declared: 2, validated: 2, hours: 10 }),
      jour('2026-11-02', { declared: 1, validated: 1, hours: 1 }),
      jour('2026-07-10', { declared: 4, validated: 3, hours: 50 }),
    ], periodeUsage('2026-11-14'))
    expect(vue.paiementsParMois.map(m => [m.mois, m.declares, m.valides])).toEqual([
      ['2026-06-01', 0, 0],
      ['2026-07-01', 4, 3],
      ['2026-08-01', 0, 0],
      ['2026-09-01', 0, 0],
      ['2026-10-01', 0, 0],
      ['2026-11-01', 3, 3],
    ])
    expect(vue.delaiMoyenHeures).toBe(7)
  })

  it('aucun jour calculé : délai absent, rien à afficher', () => {
    const vue = vueUsage([], periodeUsage('2026-11-14'))
    expect(vue).toMatchObject({ calcule: false, totalConnexions: 0, delaiMoyenHeures: null })
  })
})
