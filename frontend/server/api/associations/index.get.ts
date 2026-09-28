// GET /api/associations?statut=&plan=&q= — liste plateforme (SaAssociations) et compteurs des puces (illustratifs).
// Scénarios : `vide` (aucune association listée).
import type { ListeAssociations } from '~~/types'
import { store } from '../../mocks/store'
import { COMPTEURS_ASSOCIATIONS } from '../../mocks/plateforme'

export default defineMockHandler((event, scenario): ListeAssociations => {
  const statut = filtre(event, 'statut')
  const plan = filtre(event, 'plan')
  const q = filtre(event, 'q')?.toLocaleLowerCase('fr')
  // Compteurs de la maquette (147 au total), ajustés par les associations créées ou suspendues dans le store.
  const enPlus = store.associations.length - 3
  const compte = (s: string) => store.associations.filter(a => a.statut === s).length
  const compteurs = {
    toutes: COMPTEURS_ASSOCIATIONS.toutes + enPlus,
    active: COMPTEURS_ASSOCIATIONS.active + compte('active') - 1,
    impayee: COMPTEURS_ASSOCIATIONS.impayee + compte('impayee') - 1,
    suspendue: COMPTEURS_ASSOCIATIONS.suspendue + compte('suspendue'),
    onboarding: COMPTEURS_ASSOCIATIONS.onboarding + compte('onboarding') - 1,
  }
  const associations = scenario === 'vide'
    ? []
    : store.associations
        .filter(a => (!statut || a.statut === statut) && (!plan || a.planId === plan)
          && (!q || `${a.nom} ${a.ville}`.toLocaleLowerCase('fr').includes(q)))
        .map(associationListe)
  return { associations, compteurs }
})
