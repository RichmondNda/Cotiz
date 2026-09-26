// GET /api/paiements/:id — détail : souscripteur, projet, association, échéances couvertes, échéancier du souscripteur
// sur le projet et ses 3 derniers versements validés.
// Scénarios (MgPaiement) : `pdf` (reçu PDF), `reference-seule` (référence de transaction sans fichier).
import type { PaiementDetail, Preuve } from '~~/types'
import { store } from '../../mocks/store'

const PREUVES: Record<string, Preuve> = {
  'pdf': { type: 'pdf', nomFichier: 'recu.pdf', url: '[URL]' },
  'reference-seule': { type: 'reference', reference: 'OM-20260922-[XXXX]' },
}

export default defineMockHandler((event, scenario): PaiementDetail => {
  const p = store.paiements.find(x => x.id === parametre(event, 'id')) ?? introuvable('Paiement')
  const liste = paiementListe(p)
  return {
    ...liste,
    ...(scenario && PREUVES[scenario] ? { preuve: PREUVES[scenario] } : {}),
    echeances: liste.echeancesCouvertes,
    association: store.associations.find(a => a.id === p.associationId)!,
    souscription: store.souscriptions.find(s => s.projetId === p.projetId && s.souscripteurId === p.souscripteurId),
    echeancier: store.echeances
      .filter(e => e.projetId === p.projetId && e.souscripteurId === p.souscripteurId)
      .sort((a, b) => a.rang - b.rang),
    derniersVersements: derniersVersements(p),
  }
})
