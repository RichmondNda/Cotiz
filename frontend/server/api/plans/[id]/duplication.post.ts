// POST /api/plans/:id/duplication — copie du plan (« Essentiel (copie) »), sans abonnés ni mise en avant.
import type { Plan } from '~~/types'
import { store } from '../../../mocks/store'

export default defineMockHandler((event) => {
  const source = store.plans.find(p => p.id === parametre(event, 'id')) ?? introuvable('Plan')
  const nom = `${source.nom} (copie)`
  const copie: Plan = { ...structuredClone(source), id: slugUnique(nom, store.plans.map(p => p.id), 'plan'), nom, associationsAbonnees: 0, misEnAvant: false }
  store.plans.push(copie)
  return copie
})
