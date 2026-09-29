// GET /api/plateforme/profil — profil du super-admin connecté (SaProfil).
import { store } from '../../../mocks/store'

export default defineMockHandler(() => store.profilPlateforme)
