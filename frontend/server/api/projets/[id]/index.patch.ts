// PATCH /api/projets/:id — paramètres modifiables après création (le financement est verrouillé par le contrat).
import type { ModificationProjet } from '~~/types'
import { store } from '../../../mocks/store'

const CHAMPS = ['nom', 'description', 'imageCouvertureNom', 'souscripteursRequis', 'modalitesPaiement', 'instructionsPaiement', 'delaiGraceJours'] as const

export default defineMockHandler(async (event) => {
  const projet = store.projets.find(p => p.id === parametre(event, 'id')) ?? introuvable('Projet')
  const corps = await readBody<ModificationProjet>(event)
  if (corps.nom !== undefined && !corps.nom.trim()) erreurMetier(422, 'nom_obligatoire', 'Nom obligatoire')
  for (const cle of CHAMPS) {
    if (corps[cle] !== undefined) Object.assign(projet, { [cle]: corps[cle] })
  }
  return projet
})
