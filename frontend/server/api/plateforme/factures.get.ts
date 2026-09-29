// GET /api/plateforme/factures — facturation globale (aperçu V2 : écran « Bientôt disponible » en V1).
import type { FacturationPlateforme } from '~~/types'
import { FACTURES_PLATEFORME, KPI_FACTURATION } from '../../mocks/plateforme'

export default defineMockHandler((): FacturationPlateforme => ({ kpi: KPI_FACTURATION, factures: FACTURES_PLATEFORME }))
