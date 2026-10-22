// Fonctionnalités d'un espace basculé pendant la transition (lot 1.1, décision de l'étape d'intégration front) :
// le vrai `GET /me` n'annonce que les fonctionnalités livrées ; les écrans encore simulés gardent les leurs, pour que
// leur rendu ne bouge pas. L'écart se referme à chaque bascule.
import { FEATURE_SPECS, FEATURES } from '@cotiz/contracts'
import type { Feature } from '@cotiz/contracts'

/** Scénarios de dev (`?scenario=`) qui retirent une fonctionnalité encore simulée (états de l'inventaire). */
const SCENARIOS_SANS: Readonly<Record<string, Feature>> = {
  // Rapports : graphiques avancés « Bientôt disponibles » (MgProjetRapports), auparavant posé par le `/me` simulé.
  'graphiques-bientot-disponibles': 'analytics',
}

/**
 * Active si `/me` la livre, ou si son lot n'a encore aucun endpoint basculé (ses écrans sont simulés) et qu'aucun
 * scénario de dev ne la retire. `lotsBascules` : lots des endpoints du registre de bascule
 * (server/bascule/real-endpoints.ts).
 */
export function fonctionnalitesActives(livrees: readonly Feature[], lotsBascules: ReadonlySet<string>, scenario?: string): Feature[] {
  const retiree = scenario ? SCENARIOS_SANS[scenario] : undefined
  return FEATURES.filter(f => livrees.includes(f) || (!lotsBascules.has(FEATURE_SPECS[f].lot) && f !== retiree))
}
