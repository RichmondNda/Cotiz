import type { Echeance, Paiement, PaiementDetail, PaiementListe } from '~~/types'

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

/** Validation d'un paiement déclaré par un gestionnaire (grille, file de validation). */
export function useValidationPaiement() {
  const appel = useAppelApi()
  return (paiementId: string) => appel<Paiement>(`/paiements/${paiementId}/validation`)
}
