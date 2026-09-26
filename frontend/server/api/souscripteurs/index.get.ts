// GET /api/souscripteurs — annuaire de l'association (statut global = le pire de ses projets). Scénario : `vide`.
import type { SouscripteurAnnuaire, StatutSouscription } from '~~/types'
import { store } from '../../mocks/store'
import { ANNUAIRE_PLACEHOLDERS } from '../../mocks/referentiel'

const GRAVITE: Record<StatutSouscription, number> = { en_retard: 2, signature_attendue: 1, a_jour: 0 }

export default defineMockHandler((event, scenario): SouscripteurAnnuaire[] => {
  if (scenario === 'vide') return []
  const associationId = filtre(event, 'associationId') ?? utilisateurSession(event)?.associationId ?? 'entraide-yopougon'
  const projetsAsso = new Set(store.projets.filter(p => p.associationId === associationId).map(p => p.id))
  return store.souscripteurs
    .map((s) => {
      const liste = store.souscriptions.filter(x => x.souscripteurId === s.id && projetsAsso.has(x.projetId))
      if (!liste.length) return null
      // Le statut et les montants de l'annuaire portent sur les projets engagés (hors signature en attente d'un 2e projet).
      const engages = liste.filter(x => x.statut !== 'signature_attendue')
      const base = engages.length ? engages : liste
      const statutGlobal = base.reduce<StatutSouscription>((pire, x) => (GRAVITE[x.statut] > GRAVITE[pire] ? x.statut : pire), 'a_jour')
      const placeholder = ANNUAIRE_PLACEHOLDERS[s.id]
      return {
        ...s,
        projetIds: liste.map(x => x.projetId),
        totalVerse: placeholder?.totalVerse ?? base.reduce((t, x) => t + x.verse, 0),
        totalReste: placeholder?.totalReste ?? base.reduce((t, x) => t + x.reste, 0),
        statutGlobal,
      }
    })
    .filter((x): x is SouscripteurAnnuaire => x !== null)
})
