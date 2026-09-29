// GET /api/associations?statut=&plan=&q= — liste plateforme (SaAssociations) et compteurs des puces (illustratifs).
// Scénarios : `vide` (aucune association listée).
import type { ListeAssociations } from '~~/types'
import { store } from '../../mocks/store'
import { COMPTEURS_ASSOCIATIONS } from '../../mocks/plateforme'

export default defineMockHandler((event, scenario): ListeAssociations => {
  const statut = filtre(event, 'statut')
  const plan = filtre(event, 'plan')
  const q = filtre(event, 'q')?.toLocaleLowerCase('fr')
  // Compteurs de la maquette, ajustés par les associations créées ou suspendues dans le store.
  // « Toutes » = somme des statuts (132 actives + 15 impayées + 1 onboarding = 148) : les puces restent cohérentes.
  const compte = (s: string) => store.associations.filter(a => a.statut === s).length
  const parStatut = {
    active: COMPTEURS_ASSOCIATIONS.active + compte('active') - 1,
    impayee: COMPTEURS_ASSOCIATIONS.impayee + compte('impayee') - 1,
    suspendue: COMPTEURS_ASSOCIATIONS.suspendue + compte('suspendue'),
    onboarding: COMPTEURS_ASSOCIATIONS.onboarding + compte('onboarding') - 1,
  }
  const compteurs = { toutes: Object.values(parStatut).reduce((t, n) => t + n, 0), ...parStatut }
  const associations = scenario === 'vide'
    ? []
    : store.associations
        .filter(a => (!statut || a.statut === statut) && (!plan || a.planId === plan)
          && (!q || `${a.nom} ${a.ville}`.toLocaleLowerCase('fr').includes(q)))
        .map(associationListe)
  return { associations, compteurs }
})
