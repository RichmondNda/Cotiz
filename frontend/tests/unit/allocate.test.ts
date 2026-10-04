import { describe, expect, it } from 'vitest'
import { proposeAllocation } from '@cotiz/domain'
import { allocate, repartitionManuelle } from '~/utils/allocate'

// Situation de Moussa Diarra sur Centre communautaire : août et septembre en retard, puis octobre, novembre.
const echeances = [
  { id: 'aout', label: 'Août 2026', montant: 25000 },
  { id: 'sept', label: 'Sept. 2026', montant: 25000 },
  { id: 'oct', label: 'Oct. 2026', montant: 25000 },
  { id: 'nov', label: 'Nov. 2026', montant: 25000 },
]

describe('allocate', () => {
  it('paiement exact : couvre les plus anciennes d\'abord, reste 0', () => {
    const r = allocate(75000, echeances)
    expect(r.lignes.map(l => l.etat)).toEqual(['full', 'full', 'full', 'none'])
    expect(r.lignes.map(l => l.affecte)).toEqual([25000, 25000, 25000, 0])
    expect(r.reste).toBe(0)
    expect(r.couvertes).toBe(3)
  })

  it('paiement partiel : la dernière couverte passe en partielle', () => {
    const r = allocate(60000, echeances)
    expect(r.lignes.map(l => l.etat)).toEqual(['full', 'full', 'partial', 'none'])
    expect(r.lignes[2]!.affecte).toBe(10000)
    expect(r.reste).toBe(0)
    expect(r.couvertes).toBe(3)
  })

  it('paiement trop élevé : tout est couvert et le surplus reste à répartir', () => {
    const r = allocate(130000, echeances)
    expect(r.lignes.every(l => l.etat === 'full')).toBe(true)
    expect(r.reste).toBe(30000)
    expect(r.couvertes).toBe(4)
  })

  it('tient compte de ce qui est déjà payé (solde d\'une échéance partielle)', () => {
    // Jean Kouassi : août partiellement payé (12 500 F sur 25 000 F).
    const r = allocate(12500, [{ id: 'aout', montant: 25000, montantPaye: 12500 }, { id: 'sept', montant: 25000 }])
    expect(r.lignes.map(l => l.etat)).toEqual(['full', 'none'])
    expect(r.lignes[0]!.du).toBe(12500)
    expect(r.reste).toBe(0)
  })

  it('reprend la proposition de proposeAllocation (@cotiz/domain)', () => {
    const registre = echeances.map((e, i) => ({
      id: e.id, enrollmentId: 'e', kind: 'periodic' as const, sequence: i + 1, dueDate: `2026-0${i + 5}-05`,
      amountDue: e.montant, amountPaid: i === 0 ? 10000 : 0, amountPending: 0, status: 'late' as const,
    }))
    const attendu = proposeAllocation(55000, registre)
    const r = allocate(55000, echeances.map((e, i) => ({ ...e, montantPaye: i === 0 ? 10000 : 0 })))
    expect(r.lignes.filter(l => l.affecte > 0).map(l => ({ installmentId: l.id, amount: l.affecte }))).toEqual(attendu)
  })

  it('montant décimal : rien n\'est réparti (argent en entiers)', () => {
    expect(allocate(12500.5, echeances).couvertes).toBe(0)
  })

  it('échéance fermée (annulée, dispensée) : jamais couverte, le montant passe à la suivante', () => {
    const r = allocate(50000, echeances.map(e => (e.id === 'sept' ? { ...e, fermee: true } : e)))
    expect(r.lignes.map(l => l.affecte)).toEqual([25000, 0, 25000, 0])
    expect(r.lignes[1]!.du).toBe(0)
  })

  it('montant au-delà du reste dû : réparti jusqu\'au total, l\'excédent reste à répartir', () => {
    const r = allocate(120000, echeances)
    expect(r.lignes.map(l => l.affecte)).toEqual([25000, 25000, 25000, 25000])
    expect(r.reste).toBe(20000)
  })

  it('montant nul ou négatif : rien n\'est couvert', () => {
    expect(allocate(0, echeances).couvertes).toBe(0)
    expect(allocate(-5000, echeances).reste).toBe(0)
  })
})

describe('repartitionManuelle', () => {
  it('sur-répartition : le reste devient négatif', () => {
    const r = repartitionManuelle(75000, echeances, new Set(['aout', 'sept', 'oct', 'nov']))
    expect(r.reste).toBe(-25000)
  })

  it('décocher une échéance libère son montant', () => {
    const r = repartitionManuelle(75000, echeances, new Set(['aout', 'sept']))
    expect(r.reste).toBe(25000)
    expect(r.couvertes).toBe(2)
  })
})
