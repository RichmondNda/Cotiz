// GET /api/gestionnaire/profil — informations personnelles et préférences de notification du gestionnaire connecté.
import type { ProfilGestionnaire } from '~~/types'
import { gestionnaireConnecte, profilGestionnaire } from '../../../utils/profil-gestionnaire'

export default defineMockHandler((event): ProfilGestionnaire => profilGestionnaire(gestionnaireConnecte(event)))
