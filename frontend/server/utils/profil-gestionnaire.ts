// Profil du gestionnaire connecté (MgProfil) : fiche du store + dernier changement de mot de passe et préférences.
import type { H3Event } from 'h3'
import type { Gestionnaire, ProfilGestionnaire } from '~~/types'
import { PROFIL_GESTIONNAIRE } from '../mocks/referentiel'
import { store } from '../mocks/store'
import { gestionnaireSession } from './equipe'

export function gestionnaireConnecte(event: H3Event): Gestionnaire {
  const moi = gestionnaireSession(event)
  return store.gestionnaires.find(g => g.id === moi.id) ?? introuvable('Gestionnaire')
}

export function complementProfil(id: string) {
  store.profilsGestionnaires[id] ??= structuredClone(PROFIL_GESTIONNAIRE)
  return store.profilsGestionnaires[id]
}

export function profilGestionnaire(g: Gestionnaire): ProfilGestionnaire {
  const complement = complementProfil(g.id)
  return {
    id: g.id,
    prenom: g.prenom,
    nom: g.nom,
    email: g.email,
    telephone: g.telephone,
    role: g.role,
    associationNom: store.associations.find(a => a.id === g.associationId)?.nom ?? '',
    motDePasseModifieLe: complement.motDePasseModifieLe,
    preferences: { ...complement.preferences },
  }
}
