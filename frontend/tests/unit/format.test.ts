import { describe, expect, it } from 'vitest'
import { formatMoney } from '@cotiz/domain'
import {
  formatDate,
  formatFCFA,
  formatMois,
  formatRelatif,
  formatSaisieMontant,
  formatTelephone,
  initiales,
  lireMontant,
} from '~/utils/format'

const FINE = '\u202F'
const INSEC = '\u00A0'

describe('formatFCFA', () => {
  it('sépare les milliers par une espace fine insécable (U+202F)', () => {
    expect(formatFCFA(25000)).toBe(`25${FINE}000${INSEC}F`)
    expect(formatFCFA(1240000)).toBe(`1${FINE}240${FINE}000${INSEC}F`)
  })

  it('délègue à formatMoney de @cotiz/domain (même rendu, montant entier ou Money)', () => {
    for (const n of [0, 500, 25000, 1240000, -25000]) expect(formatFCFA(n)).toBe(formatMoney(n, 'XOF'))
    expect(formatFCFA({ amount: 75000, currency: 'XOF' })).toBe(`75${FINE}000${INSEC}F`)
  })

  it('garde la devise d\'un Money : XAF → « F », GNF → « FG »', () => {
    expect(formatFCFA({ amount: 25000, currency: 'XAF' })).toBe('25\u202F000\u00A0F')
    expect(formatFCFA({ amount: 25000, currency: 'GNF' })).toBe('25\u202F000\u00A0FG')
    expect(formatFCFA({ amount: 25000, currency: 'GNF' }, { unite: false })).toBe('25\u202F000')
  })

  it('refuse un montant décimal (argent en entiers, jamais de flottant)', () => {
    expect(() => formatFCFA(12500.4)).toThrow()
  })

  it('peut omettre l\'unité (champ suffixé « F CFA »)', () => {
    expect(formatFCFA(75000, { unite: false })).toBe(`75${FINE}000`)
  })

  it('laisse passer les placeholders de la maquette', () => {
    expect(formatFCFA('[MONTANT]')).toBe(`[MONTANT]${INSEC}F`)
  })

  it('ne contient jamais d\'espace ordinaire', () => {
    expect(formatFCFA(9594000)).not.toContain(' ')
  })
})

describe('saisie de montant', () => {
  it('reformate à la saisie et relit la valeur', () => {
    expect(formatSaisieMontant('75000')).toBe(`75${FINE}000`)
    expect(formatSaisieMontant('75 0a00')).toBe(`75${FINE}000`)
    expect(formatSaisieMontant('')).toBe('')
    expect(lireMontant(`75${FINE}000`)).toBe(75000)
    expect(lireMontant('')).toBeNull()
  })
})

describe('dates', () => {
  it('formate les dates en français', () => {
    expect(formatDate('2026-10-05')).toBe('5 oct. 2026')
    expect(formatDate('2026-09-05', 'numerique')).toBe('05/09/2026')
    expect(formatDate('2026-10-05', 'jour-mois-long')).toBe('5 octobre')
    expect(formatDate('2026-09-25', 'complet')).toBe('vendredi 25 septembre 2026')
    expect(formatMois('2026-08-05')).toBe('Août 2026')
    expect(formatMois('2026-09-05', 'court')).toBe('Sept.')
  })

  it('formate les dates relatives', () => {
    const ref = new Date('2026-09-25T10:00:00')
    expect(formatRelatif('2026-09-25', { maintenant: ref })).toBe('aujourd\'hui')
    expect(formatRelatif('2026-09-24', { maintenant: ref })).toBe('hier')
    expect(formatRelatif('2026-09-22', { maintenant: ref })).toBe('il y a 3 j')
    expect(formatRelatif('2026-09-22', { maintenant: ref, style: 'long' })).toBe('il y a 3 jours')
    expect(formatRelatif('2026-09-03', { maintenant: ref })).toBe('3 sept.')
    expect(formatRelatif('2025-12-03', { maintenant: ref })).toBe('3 déc. 2025')
    expect(formatRelatif('2026-10-05', { maintenant: ref })).toBe('dans 10 jours')
    expect(formatRelatif('2026-09-25T08:00:00', { maintenant: ref })).toBe('il y a 2 h')
  })
})

describe('formatTelephone', () => {
  it('groupe par 2 après l\'indicatif', () => {
    expect(formatTelephone('+2250708091011')).toBe('+225 07 08 09 10 11')
    expect(formatTelephone('0544218790')).toBe('+225 05 44 21 87 90')
    expect(formatTelephone('+225 07 08 09 10 11')).toBe('+225 07 08 09 10 11')
  })

  it('laisse passer les placeholders', () => {
    expect(formatTelephone('[XX XX XX XX]')).toBe('[XX XX XX XX]')
  })
})

describe('initiales', () => {
  it('prend les deux premières initiales significatives', () => {
    expect(initiales('Awa Koné')).toBe('AK')
    expect(initiales('Entraide Yopougon')).toBe('EY')
    expect(initiales('Association des ressortissants de Man')).toBe('AR')
    expect(initiales('Richy')).toBe('R')
  })
})
