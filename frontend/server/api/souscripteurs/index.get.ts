// GET /api/souscripteurs — annuaire de l'association (statut global = le pire de ses projets engagés). Scénario : `vide`.
import type { SouscripteurAnnuaire } from '~~/types'
import { store } from '../../mocks/store'
import { ANNUAIRE_PLACEHOLDERS } from '../../mocks/referentiel'

export default defineMockHandler((event, scenario): SouscripteurAnnuaire[] => {
  if (scenario === 'vide') return []
  const associationId = filtre(event, 'associationId') ?? utilisateurSession(event)?.associationId ?? 'entraide-yopougon'
  return store.souscripteurs
    .map((s) => {
      const liste = souscriptionsAssociation(s.id, associationId)
      if (!liste.length) return null
      // Les montants de l'annuaire portent sur les projets engagés (hors signature en attente d'un 2e projet).
      const engages = liste.filter(x => x.statut !== 'signature_attendue')
      const base = engages.length ? engages : liste
      const placeholder = ANNUAIRE_PLACEHOLDERS[s.id]
      return {
        ...souscripteurAssociation(s),
        projetIds: liste.map(x => x.projetId),
        totalVerse: placeholder?.totalVerse ?? base.reduce((t, x) => t + x.verse, 0),
        totalReste: placeholder?.totalReste ?? base.reduce((t, x) => t + x.reste, 0),
        statutGlobal: statutGlobal(liste),
      }
    })
    .filter((x): x is SouscripteurAnnuaire => x !== null)
})
