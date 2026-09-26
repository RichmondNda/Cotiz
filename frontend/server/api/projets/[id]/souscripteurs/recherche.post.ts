// POST /api/projets/:id/souscripteurs/recherche — avant l'ajout : ce téléphone a-t-il déjà un compte Cotiz ?
// Numéros mockés (server/mocks/IDENTIFIANTS.md) : un souscripteur du projet → `deja_inscrit` ;
// un compte connu hors projet, ou 01 00 00 00 01 (Ibrahim Touré) → `compte_existant` ; sinon `nouveau`.
import type { ResultatRechercheSouscripteur } from '~~/types'
import { store } from '../../../../mocks/store'

/** Ibrahim Touré n'a qu'un numéro placeholder dans les données de référence : numéro de démonstration. */
const NUMEROS_DEMO: Record<string, string> = { '0100000001': 'ibrahim-toure' }

export default defineMockHandler(async (event): Promise<ResultatRechercheSouscripteur> => {
  const id = parametre(event, 'id')
  const projet = projetGestionnaire(id)
  const { telephone } = await readBody<{ telephone?: string }>(event)
  const chiffres = chiffresTel(telephone ?? '')
  if (chiffres.length !== 10) erreurMetier(422, 'telephone_invalide', 'Telephone invalide')

  const s = store.souscripteurs.find(x => x.id === NUMEROS_DEMO[chiffres] || chiffresTel(x.telephone) === chiffres)
  if (!s) return { cas: 'nouveau' }
  if (souscriptionsActives(id).some(x => x.souscripteurId === s.id)) return { cas: 'deja_inscrit', souscripteur: s }
  const projets = store.souscriptions
    .filter(x => x.souscripteurId === s.id && !x.retireLe && x.projetId !== projet.id)
    .map(x => store.projets.find(p => p.id === x.projetId)?.nom)
    .filter((n): n is string => Boolean(n))
  return { cas: 'compte_existant', souscripteur: s, nbAssociations: s.associationIds.length, projets }
})
