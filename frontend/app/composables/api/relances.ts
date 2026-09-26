import type { RegleRelance, Relances } from '~~/types'

/** Retardataires, règles automatiques et historique des envois de l'association (MgRelances). */
export const useRelances = () => useApi<Relances>('/relances')

/** Relance ponctuelle d'un ou plusieurs souscripteurs (page Relances, fiche souscripteur). */
export function useEnvoiRelance() {
  const appel = useAppelApi()
  return (corps: { souscripteurIds: string[], projetId?: string, message?: string }) =>
    appel<{ envoyees: number, canal: 'notification' | 'sms' }>('/relances', { body: corps })
}

/** Active ou désactive une règle de relance automatique. */
export function useRegleRelance() {
  const appel = useAppelApi()
  return (id: string, active: boolean) => appel<RegleRelance>(`/relances/regles/${id}`, { method: 'PATCH', body: { active } })
}
