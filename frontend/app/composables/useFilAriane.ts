// Fil d'Ariane de la barre supérieure du back-office, fourni par la page :
//   useFilAriane([{ label: 'Projets', to: '/asso/projets' }, { label: projet.nom }])
// Sans appel, la barre affiche le titre de la page (`definePageMeta({ titre })`).
import type { MaybeRefOrGetter } from 'vue'
import type { RouteLocationRaw } from 'vue-router'

export interface ElementFil {
  label: string
  to?: RouteLocationRaw
}

export function useEtatFilAriane() {
  return useState<ElementFil[] | null>('cz-fil-ariane', () => null)
}

export function useFilAriane(elements: MaybeRefOrGetter<ElementFil[]>) {
  const etat = useEtatFilAriane()
  watchEffect(() => (etat.value = toValue(elements)))
  onBeforeUnmount(() => (etat.value = null))
}
