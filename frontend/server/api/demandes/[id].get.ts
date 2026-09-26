// GET /api/demandes/:id — scénarios : `approuvee`, `refusee`.
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario) => {
  const d = store.demandes.find(x => x.id === parametre(event, 'id')) ?? introuvable('Demande')
  if (scenario === 'approuvee' || scenario === 'refusee') return { ...d, statut: scenario }
  return d
})
