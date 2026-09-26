import type {
  AssociationMembre,
  DetailSouscriptionMembre,
  FicheSouscripteur,
  Souscripteur,
  SouscripteurAnnuaire,
  SouscriptionMembre,
} from '~~/types'

/** Annuaire des souscripteurs de l'association. */
export const useSouscripteurs = (filtres: MaybeRefOrGetter<{ associationId?: string }> = {}) =>
  useApi<SouscripteurAnnuaire[]>('/souscripteurs', { query: filtres })

export const useSouscripteur = (id: MaybeRefOrGetter<string>) =>
  useApi<FicheSouscripteur>(() => `/souscripteurs/${toValue(id)}`)

// ---------------------------------------------------------------- Espace souscripteur (utilisateur connecté)

/** Fiche du souscripteur connecté (profil). */
export const useMonProfil = () => useApi<Souscripteur>('/moi', { cle: 'moi-profil' })

/** Projets du souscripteur connecté (accueil, déclaration), avec retards et prochaine échéance. */
export const useMesSouscriptions = () => useApi<SouscriptionMembre[]>('/moi/souscriptions')

/** Détail d'un projet du souscripteur connecté : échéancier, paiements déclarés, contrat. */
export const useMaSouscription = (projetId: MaybeRefOrGetter<string>) =>
  useApi<DetailSouscriptionMembre>(() => `/moi/souscriptions/${toValue(projetId)}`)

/** Associations du souscripteur connecté et ses projets dans chacune. */
export const useMesAssociations = () => useApi<AssociationMembre[]>('/moi/associations')

export const useMonAssociation = (id: MaybeRefOrGetter<string>) =>
  useApi<AssociationMembre>(() => `/moi/associations/${toValue(id)}`)
