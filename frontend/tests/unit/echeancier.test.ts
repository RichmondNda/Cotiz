import { describe, expect, it } from 'vitest'
import { generateSchedule } from '@cotiz/domain'
import { jourEcheanceDe, lignesEcheancier, nbEcheances, premieresEcheances, totalParSouscripteur } from '~/utils/echeancier'
import type { TermesEcheancier } from '~/utils/echeancier'

// Centre communautaire (seed-reference) : 50 000 F d'entrée, puis 25 000 F le 5 de chaque mois, mars 2026 → août 2027.
const centre: TermesEcheancier = {
  fondsEntree: 50000, montantEcheance: 25000, frequence: 'mensuelle', jourEcheance: 5,
  typeCalendrier: 'dates_fixes', dateDebut: '2026-03-05', dateFin: '2027-08-05',
}

describe('échéancier délégué à generateSchedule (@cotiz/domain)', () => {
  it('reprend exactement les lignes du domaine', () => {
    expect(lignesEcheancier(centre)).toEqual(generateSchedule({
      installmentAmount: 25000, entryFeeAmount: 50000, frequency: 'monthly', dueDay: 5,
      scheduleType: 'fixed', startDate: '2026-03-05', endDate: '2027-08-05',
    }))
  })

  it('compte 18 échéances et un engagement de 500 000 F', () => {
    expect(nbEcheances(centre)).toBe(18)
    expect(totalParSouscripteur(centre)).toBe(500000)
  })

  it('premières lignes : fonds d’entrée à la date de la première échéance, puis « Échéance n »', () => {
    const lignes = premieresEcheances(centre, 3)
    expect(lignes).toEqual([
      { libelle: 'Fonds d’entrée', date: '2026-03-05', montant: 50000, estFondsEntree: true },
      { libelle: 'Échéance 1', date: '2026-03-05', montant: 25000, estFondsEntree: false },
      { libelle: 'Échéance 2', date: '2026-04-05', montant: 25000, estFondsEntree: false },
    ])
  })

  it('cycle roulant : ni nombre d’échéances ni total, 12 lignes générées par défaut', () => {
    const roulant: TermesEcheancier = { ...centre, typeCalendrier: 'cycle_roulant', dateFin: null, fondsEntree: null }
    expect(nbEcheances(roulant)).toBeNull()
    expect(totalParSouscripteur(roulant)).toBeNull()
    expect(lignesEcheancier(roulant)).toHaveLength(12)
  })

  it('hebdomadaire sans jour saisi : le jour de la semaine de la date de début', () => {
    const hebdo: TermesEcheancier = { ...centre, frequence: 'hebdomadaire', jourEcheance: undefined, dateFin: '2026-03-26', fondsEntree: null }
    expect(lignesEcheancier(hebdo).map(l => l.dueDate)).toEqual(['2026-03-05', '2026-03-12', '2026-03-19', '2026-03-26'])
  })

  it('termes incomplets ou invalides (saisie en cours) : aucune ligne, pas d’erreur', () => {
    expect(lignesEcheancier({ ...centre, montantEcheance: 0 })).toEqual([])
    expect(lignesEcheancier({ ...centre, dateFin: '2026-01-05' })).toEqual([])
    expect(nbEcheances({ ...centre, dateFin: null })).toBeNull()
  })
})

describe('engagement hors des entiers sûrs', () => {
  it('saisie de 15 chiffres sur 18 mois : pas de total (aucune erreur au rendu)', () => {
    expect(totalParSouscripteur({ ...centre, montantEcheance: 999_999_999_999_999 })).toBeNull()
  })
})

describe('jour d’échéance envoyé à pr.create (jourEcheanceDe) : celui de l’aperçu', () => {
  // Mercredi 4 mars 2026 : jour ISO 3 (et non le 4 du mois).
  const hebdo: TermesEcheancier = { ...centre, frequence: 'hebdomadaire', jourEcheance: undefined, dateDebut: '2026-03-04', dateFin: '2026-04-30' }

  it('hebdomadaire sans jour saisi : jour ISO de la date de début', () => {
    expect(jourEcheanceDe(hebdo)).toBe(3)
    expect(jourEcheanceDe({ ...hebdo, dateDebut: '2026-03-15' })).toBe(7)
  })

  it('le back, avec ce jour, génère les dates de l’aperçu', () => {
    const back = generateSchedule({
      installmentAmount: 25000, entryFeeAmount: 50000, frequency: 'weekly', dueDay: jourEcheanceDe(hebdo),
      scheduleType: 'fixed', startDate: '2026-03-04', endDate: '2026-04-30',
    })
    expect(back).toEqual(lignesEcheancier(hebdo))
    expect(back.filter(l => l.kind === 'periodic')[0]!.dueDate).toBe('2026-03-04')
  })

  it('mensuel : jour saisi, sinon jour du mois de la date de début', () => {
    expect(jourEcheanceDe(centre)).toBe(5)
    expect(jourEcheanceDe({ ...centre, jourEcheance: undefined, dateDebut: '2026-03-17' })).toBe(17)
  })
})
