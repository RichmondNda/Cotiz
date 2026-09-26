import type {
  AnalyseImport,
  ContratProjet,
  LigneGrilleProjet,
  ModificationProjet,
  NouveauProjet,
  NouvelleInscription,
  Projet,
  RapportProjet,
  ResultatRechercheSouscripteur,
  SouscriptionAvecSouscripteur,
  SyntheseProjet,
} from '~~/types'

export const useProjets = (filtres: MaybeRefOrGetter<{ associationId?: string, statut?: string }> = {}) =>
  useApi<Projet[]>('/projets', { query: filtres })

/** `immediat: false` : pas d'appel tant que `refresh()` n'est pas demandé (identifiant optionnel). */
export const useProjet = (id: MaybeRefOrGetter<string>, options: { immediat?: boolean } = {}) =>
  useApi<Projet>(() => `/projets/${toValue(id)}`, options)

/** Souscripteurs d'un projet (onglet Souscripteurs). */
export const useSouscripteursProjet = (id: MaybeRefOrGetter<string>) =>
  useApi<SouscriptionAvecSouscripteur[]>(() => `/projets/${toValue(id)}/souscripteurs`)

/** Grille d'échéances d'un projet (onglet Paiements). */
export const useGrilleProjet = (id: MaybeRefOrGetter<string>) =>
  useApi<LigneGrilleProjet[]>(() => `/projets/${toValue(id)}/echeances`)

/** Création d'un projet (MgNouveauProjet) : renvoie le projet créé. */
export function useCreationProjet() {
  const appel = useAppelApi()
  return (projet: NouveauProjet) => appel<Projet>('/projets', { body: projet })
}

/** Vue d'ensemble d'un projet : retardataires, points à traiter, collecte par échéance. */
export const useSyntheseProjet = (id: MaybeRefOrGetter<string>) =>
  useApi<SyntheseProjet>(() => `/projets/${toValue(id)}/synthese`)

/** Rapports d'un projet : situation par souscripteur, taux cumulé, statuts. */
export const useRapportProjet = (id: MaybeRefOrGetter<string>) =>
  useApi<RapportProjet>(() => `/projets/${toValue(id)}/rapport`)

export const useContratProjet = (id: MaybeRefOrGetter<string>) =>
  useApi<ContratProjet>(() => `/projets/${toValue(id)}/contrat`)

/** Mutations du détail d'un projet (gestionnaire) : à appeler dans `setup`. */
export function useActionsProjet() {
  const appel = useAppelApi()
  return {
    rechercherSouscripteur: (projetId: string, telephone: string) =>
      appel<ResultatRechercheSouscripteur>(`/projets/${projetId}/souscripteurs/recherche`, { body: { telephone } }),
    inscrireSouscripteur: (projetId: string, inscription: NouvelleInscription) =>
      appel<SouscriptionAvecSouscripteur>(`/projets/${projetId}/souscripteurs`, { body: inscription }),
    retirerSouscripteur: (projetId: string, souscripteurId: string) =>
      appel(`/projets/${projetId}/souscripteurs/${souscripteurId}`, { method: 'DELETE' }),
    relancer: (projetId: string, souscripteurIds: string[]) =>
      appel<{ envoyees: number }>('/relances', { body: { projetId, souscripteurIds } }),
    modifierProjet: (projetId: string, modification: ModificationProjet) =>
      appel<Projet>(`/projets/${projetId}`, { method: 'PATCH', body: modification }),
    cloturerProjet: (projetId: string) => appel<Projet>(`/projets/${projetId}/cloture`),
    supprimerProjet: (projetId: string) => appel<{ supprime: string }>(`/projets/${projetId}`, { method: 'DELETE' }),
    analyserImport: (projetId: string, fichier: string) =>
      appel<AnalyseImport>(`/projets/${projetId}/import/analyse`, { body: { fichier } }),
    importer: (projetId: string, lignes: number, canal: 'sms' | 'email' | 'les_deux') =>
      appel<{ importes: number, invitations: number }>(`/projets/${projetId}/import`, { body: { lignes, canal } }),
  }
}
