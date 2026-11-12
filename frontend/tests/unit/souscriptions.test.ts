// Règle des boutons « Déclarer un paiement » (retours d'interface du 2026-11-12) : mêmes refus que le back (me.declare).
import { describe, expect, it } from 'vitest'
import { peutDeclarer } from '~/utils/souscriptions'

const declarable = {
  projet: { statut: 'en_cours' as const },
  statut: 'en_retard' as const,
  association: { statut: 'active' },
  reste: 25000,
}

describe('peutDeclarer', () => {
  it('projet en cours, association active, reste à régler : oui', () => {
    expect(peutDeclarer(declarable)).toBe(true)
    expect(peutDeclarer({ ...declarable, statut: 'a_jour' })).toBe(true)
  })

  it('projet terminé ou archivé, contrat à signer, association suspendue, rien à régler : non', () => {
    expect(peutDeclarer({ ...declarable, projet: { statut: 'termine' } })).toBe(false)
    expect(peutDeclarer({ ...declarable, statut: 'signature_attendue' })).toBe(false)
    expect(peutDeclarer({ ...declarable, association: { statut: 'suspendue' } })).toBe(false)
    expect(peutDeclarer({ ...declarable, reste: 0 })).toBe(false)
  })
})
