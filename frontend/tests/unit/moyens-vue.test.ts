// Moyens de paiement saisis (onboarding, paramètres) → corps de `as.pm.replace`, validé par le contrat (lot 2.1, étape 2 :
// `details` selon le type, opérateur codé, numéro E.164, instructions obligatoires pour les espèces).
import { ENDPOINTS } from '@cotiz/contracts'
import { describe, expect, it } from 'vitest'
import { erreursMoyens, versMoyens } from '~/composables/api/vues/associations'

const corps = ENDPOINTS['as.pm'].operations.replace.request.body

describe('versMoyens', () => {
  it('saisie de l’onboarding : corps accepté par le contrat', () => {
    const items = versMoyens([
      { moyen: 'virement', iban: 'CI93 CI00 8011 1234 5678 9012 34' },
      { moyen: 'mobile_money', numeroMobileMoney: '07 08 09 10 11', operateur: 'Orange' },
      { moyen: 'especes', instructions: 'Remise au trésorier lors de la réunion mensuelle' },
    ], 'Indiquez votre nom en référence')
    expect(corps.safeParse({ items }).success).toBe(true)
    expect(items).toEqual([
      { kind: 'bank_transfer', label: 'Virement bancaire', details: { iban: 'CI93 CI00 8011 1234 5678 9012 34' }, instructions: 'Indiquez votre nom en référence', isActive: true },
      { kind: 'mobile_money', label: 'Orange Money', details: { operator: 'orange', number: '+2250708091011' }, instructions: null, isActive: true },
      { kind: 'cash', label: 'Espèces', details: {}, instructions: 'Remise au trésorier lors de la réunion mensuelle', isActive: true },
    ])
  })

  it('opérateur saisi en clair ou par son libellé (qui contient le code) : code du contrat', () => {
    for (const [saisie, code] of [['MTN MoMo', 'mtn'], ['moov', 'moov'], ['Wave', 'wave'], ['Orange Money', 'orange']] as const) {
      expect(versMoyens([{ moyen: 'mobile_money', numeroMobileMoney: '+2250508091011', operateur: saisie }])[0]!.details).toEqual({ operator: code, number: '+2250508091011' })
    }
  })

  it('opérateur inconnu : transmis tel quel, refusé par le contrat (champ details.operator)', () => {
    const items = versMoyens([{ moyen: 'mobile_money', numeroMobileMoney: '0708091011', operateur: 'Autre' }])
    const issues = corps.safeParse({ items }).error?.issues.map(i => i.path.join('.'))
    expect(issues).toEqual(['items.0.details.operator'])
  })
})

describe('erreursMoyens', () => {
  it('saisie valide : aucune erreur', () => {
    expect(erreursMoyens([
      { moyen: 'virement', iban: 'CI93 CI00 8011 1234 5678 9012 34' },
      { moyen: 'mobile_money', numeroMobileMoney: '07 08 09 10 11', operateur: 'Orange' },
      { moyen: 'especes', instructions: 'Remise au trésorier' },
    ])).toEqual({})
  })

  it('un message par moyen refusé, selon le champ', () => {
    expect(erreursMoyens([
      { moyen: 'virement', iban: '0708091011' },
      { moyen: 'mobile_money', numeroMobileMoney: '07 08 09 10 11', operateur: 'Autre' },
      { moyen: 'especes' },
    ])).toEqual({
      virement: 'Indiquez un IBAN valide.',
      mobile_money: 'Précisez l’opérateur : Orange, MTN, Moov ou Wave.',
      especes: 'Précisez les instructions de paiement.',
    })
  })

  it('numéro manquant : message du numéro', () => {
    expect(erreursMoyens([{ moyen: 'mobile_money', operateur: 'Wave' }])).toEqual({ mobile_money: 'Indiquez un numéro de téléphone valide.' })
  })
})
