// GET /api/plans/:id
import { store } from '../../mocks/store'

export default defineMockHandler(event => store.plans.find(p => p.id === parametre(event, 'id')) ?? introuvable('Plan'))
