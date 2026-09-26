// GET /api/projets/:id
import { store } from '../../../mocks/store'

export default defineMockHandler(event => store.projets.find(p => p.id === parametre(event, 'id')) ?? introuvable('Projet'))
