// Authentification des écrans publics (connexions, première connexion, mot de passe oublié).
// Identifiants mockés : server/mocks/IDENTIFIANTS.md. À appeler dans `setup`.
import type { DemandeConnexion, EnvoiCode, ProfilMotDePasse, ResultatConnexion } from '~~/types'

export function useAuth() {
  const appel = useAppelApi()
  return {
    seConnecter: (demande: DemandeConnexion) => appel<ResultatConnexion>('/session/connexion', { body: demande }),
    /** Plateforme : code de vérification à 6 chiffres. */
    verifierCodeConnexion: (code: string) => appel<ResultatConnexion>('/session/code', { body: { code } }),
    /** Première connexion : remplace le mot de passe provisoire. */
    definirPremierMotDePasse: (motDePasse: string) => appel<ResultatConnexion>('/session/mot-de-passe', { body: { motDePasse } }),
    demanderCodeMotDePasse: (profil: ProfilMotDePasse, identifiant: string) =>
      appel<EnvoiCode>('/mot-de-passe/code', { body: { profil, identifiant } }),
    verifierCodeMotDePasse: (code: string) => appel<{ ok: true }>('/mot-de-passe/verification', { body: { code } }),
    enregistrerMotDePasse: (motDePasse: string) => appel<{ ok: true }>('/mot-de-passe/nouveau', { body: { motDePasse } }),
  }
}
