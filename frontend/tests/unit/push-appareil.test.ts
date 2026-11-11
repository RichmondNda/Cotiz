import { describe, expect, it } from 'vitest'
import { decisionAbonnement, lireAbonnementMemorise } from '../../app/utils/push-appareil'

/**
 * Lot 4.2 : appareil partagé. L'abonnement Web Push du navigateur n'est gardé que s'il est mémorisé pour la personne
 * connectée ; sinon (autre personne dont la session a expiré, propriétaire inconnu) il est retiré.
 */
describe('abonnement push mémorisé', () => {
  it('lecture tolérante : ancien format, JSON abîmé ou incomplet → propriétaire inconnu', () => {
    expect(lireAbonnementMemorise(JSON.stringify({ id: 'a', userId: 'u1' }))).toEqual({ id: 'a', userId: 'u1' })
    expect(lireAbonnementMemorise('0196f000-0000-7000-8000-000000000001')).toBeNull()
    expect(lireAbonnementMemorise('{"id":"a"}')).toBeNull()
    expect(lireAbonnementMemorise('{"id":"","userId":"u1"}')).toBeNull()
    expect(lireAbonnementMemorise('null')).toBeNull()
    expect(lireAbonnementMemorise(null)).toBeNull()
  })

  it('garde l’abonnement de la personne connectée, retire celui d’une autre ou d’un propriétaire inconnu', () => {
    const deU1 = { id: 'a', userId: 'u1' }
    expect(decisionAbonnement(true, deU1, 'u1')).toBe('garder')
    expect(decisionAbonnement(true, deU1, 'u2')).toBe('retirer')
    expect(decisionAbonnement(true, null, 'u2')).toBe('retirer')
    expect(decisionAbonnement(false, deU1, 'u2')).toBe('rien')
  })
})
