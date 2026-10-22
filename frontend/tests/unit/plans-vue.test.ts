// Vue des plans (choix Q4 du lot 1.2) : le back ne porte que les fonctionnalités soumises au plan ; l'interface ajoute
// en tête celles de tout plan (`payments`), comme la maquette, et ne les renvoie jamais au back.
import type { PublicPlan } from '@cotiz/contracts'
import { describe, expect, it } from 'vitest'
import { versPlanInput, vuePlans } from '~/composables/api/vues/plans'

const xof = (amount: number) => ({ amount, currency: 'XOF' as const })
const plan = (code: string, name: string, features: PublicPlan['features']): PublicPlan => ({
  id: `00000000-0000-7000-8000-${String(code.length).padStart(12, '0')}`, code, name, description: null, priceMonthly: xof(0), priceYearly: xof(0),
  limits: { projects: 1, subscribers: 20, managers: 1 }, features, isFeatured: false,
})

describe('vuePlans', () => {
  const reels = [plan('decouverte', 'Découverte', []), plan('essentiel', 'Essentiel', ['contracts', 'auto_reminders'])]

  it('fonctionnalités de tout plan en tête, puis « Tout <précédent> » et les nouveautés', () => {
    const [decouverte, essentiel] = vuePlans(reels)
    expect(decouverte!.fonctionnalites).toEqual(['Grille d’échéances', 'Déclaration et validation des paiements'])
    expect(essentiel!.fonctionnalites).toEqual(['Tout Découverte', 'Contrats à signer en ligne', 'Relances automatiques'])
  })

  it('saisie → corps du contrat : seules les fonctionnalités soumises au plan', () => {
    const vues = vuePlans(reels)
    const input = versPlanInput({ ...vues[1]!, nom: 'Famille' }, vues)
    expect(input.features.sort()).toEqual(['auto_reminders', 'contracts'])
    expect(versPlanInput(vues[0]!, vues).features).toEqual([])
  })

  it('fonctionnalité soumise au plan sans libellé (team…) : gardée telle quelle, jamais perdue à l’enregistrement', () => {
    const vues = vuePlans([plan('equipe', 'Équipe', ['team', 'contracts'])])
    expect(vues[0]!.fonctionnalites).toContain('team')
    expect(versPlanInput(vues[0]!, vues).features.sort()).toEqual(['contracts', 'team'])
  })

  it('prix : entier et devise tels quels, jamais 0 F à la place d’un prix non saisi', () => {
    const vues = vuePlans(reels)
    const input = versPlanInput({ ...vues[1]!, prixMensuel: 10000, prixAnnuel: 100000 }, vues)
    expect(input.priceMonthly).toEqual({ amount: 10000, currency: 'XOF' })
    expect(input.priceYearly).toEqual({ amount: 100000, currency: 'XOF' })
    expect(() => versPlanInput({ ...vues[1]!, prixMensuel: '[PRIX]' }, vues)).toThrow('prix')
    expect(() => versPlanInput({ ...vues[1]!, prixAnnuel: '[PRIX]' }, vues)).toThrow('prix')
  })
})
