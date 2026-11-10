// Association suspendue vue par le souscripteur (2026-11-10) : AssociationRef.suspended → statut « suspendue »,
// projets marqués et retirés de la déclaration.
import { describe, expect, it } from 'vitest'
import { vueAssociationMembre } from '~/composables/api/vues/souscripteur'
import { associationsSuspendues, estSuspendue } from '~/utils/souscriptions'

const id = (n: number) => `00000000-0000-7000-8000-00000000000${n}`
const ref = (n: number, name: string, suspended: boolean) => ({ id: id(n), name, logoFileId: null, suspended })

describe('association suspendue (espace souscripteur)', () => {
  it('AssociationRef.suspended → statut « suspendue », sinon « active »', () => {
    expect(vueAssociationMembre(ref(1, 'Entraide', true)).statut).toBe('suspendue')
    expect(vueAssociationMembre(ref(2, 'Man', false)).statut).toBe('active')
  })

  it('projets marqués ; noms des associations suspendues sans doublon, dans l’ordre des projets', () => {
    const entraide = { association: vueAssociationMembre(ref(1, 'Entraide', true)) }
    const man = { association: vueAssociationMembre(ref(2, 'Man', false)) }
    const bouake = { association: vueAssociationMembre(ref(3, 'Bouaké', true)) }
    expect([entraide, man, bouake].map(estSuspendue)).toEqual([true, false, true])
    expect(associationsSuspendues([entraide, man, entraide, bouake])).toEqual(['Entraide', 'Bouaké'])
    expect(associationsSuspendues([man])).toEqual([])
  })
})
