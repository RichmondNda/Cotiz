import type { Echeance, Paiement, PaiementDetail, PaiementListe, RejetPaiement, ValidationPaiement } from '~~/types'

type FiltresPaiements = {
  statut?: string
  souscripteurId?: string
  projetId?: string
  associationId?: string
}

export const usePaiements = (filtres: MaybeRefOrGetter<FiltresPaiements> = {}) =>
  useApi<PaiementListe[]>('/paiements', { query: filtres })

export const usePaiement = (id: MaybeRefOrGetter<string>) => useApi<PaiementDetail>(() => `/paiements/${toValue(id)}`)

export const useEcheances = (filtres: MaybeRefOrGetter<{ projetId?: string, souscripteurId?: string, statut?: string }> = {}) =>
  useApi<Echeance[]>('/echeances', { query: filtres })

/** Validation d'un paiement déclaré par un gestionnaire (grille, file de validation, détail), répartition ajustable. */
export function useValidationPaiement() {
  const appel = useAppelApi()
  return (paiementId: string, corps: ValidationPaiement = {}) => appel<Paiement>(`/paiements/${paiementId}/validation`, { body: corps })
}

/** Traitement d'un paiement par le gestionnaire : valider, rejeter (motif obligatoire), annuler le dernier traitement. */
export function useTraitementPaiement() {
  const appel = useAppelApi()
  return {
    valider: useValidationPaiement(),
    rejeter: (paiementId: string, corps: RejetPaiement) => appel<Paiement>(`/paiements/${paiementId}/rejet`, { body: corps }),
    annuler: (paiementId: string) => appel<Paiement>(`/paiements/${paiementId}/annulation`),
  }
}
