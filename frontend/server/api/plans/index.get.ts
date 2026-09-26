// GET /api/plans — plans d'abonnement. Scénario : `aucun-plan`.
import { store } from '../../mocks/store'

export default defineMockHandler((_event, scenario) => (scenario === 'aucun-plan' ? [] : store.plans))
