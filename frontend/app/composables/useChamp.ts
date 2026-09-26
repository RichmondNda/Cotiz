// Contexte partagé entre <CzField> et le contrôle qu'il contient (CzInput, CzSelect…) :
// identifiant du contrôle, description (aide / erreur) et état d'erreur, pour l'accessibilité.
import type { ComputedRef, InjectionKey } from 'vue'

export interface ContexteChamp {
  id: string
  decritPar: ComputedRef<string | undefined>
  enErreur: ComputedRef<boolean>
  requis: ComputedRef<boolean>
}

export const CLE_CHAMP: InjectionKey<ContexteChamp> = Symbol('cz-champ')

/** Dans un contrôle : récupère le contexte du CzField parent (ou en crée un autonome). */
export function useChamp(props: { id?: string, erreur?: boolean }) {
  const parent = inject(CLE_CHAMP, null)
  const idLocal = `cz-${useId()}`
  return {
    id: computed(() => props.id ?? parent?.id ?? idLocal),
    decritPar: computed(() => parent?.decritPar.value),
    enErreur: computed(() => Boolean(props.erreur) || Boolean(parent?.enErreur.value)),
    requis: computed(() => Boolean(parent?.requis.value)),
  }
}
