// Pagination côté client d'une liste dont le total réel peut dépasser les lignes détaillées des données de
// démonstration (annuaire : « 1–12 sur 52 », retardataires : « 1–5 sur 14 »).
// Sans filtre, le total affiché est `totalReference` (compteur de l'association) ; filtré, celui des lignes trouvées.
// Les pages au-delà des lignes détaillées sont vides (état « Rien à afficher sur cette page »).
import type { MaybeRefOrGetter, Ref } from 'vue'

export function usePagination<T>(
  lignes: Ref<T[]>,
  options: { parPage: number, totalReference?: MaybeRefOrGetter<number>, filtre?: MaybeRefOrGetter<boolean> },
) {
  const page = ref(1)
  const total = computed(() => (toValue(options.filtre)
    ? lignes.value.length
    : Math.max(toValue(options.totalReference) ?? 0, lignes.value.length)))
  const pages = computed(() => Math.max(1, Math.ceil(total.value / options.parPage)))
  const lignesPage = computed(() => lignes.value.slice((page.value - 1) * options.parPage, page.value * options.parPage))
  const plage = computed(() => {
    const n = lignesPage.value.length
    const debut = (page.value - 1) * options.parPage + 1
    return n ? `${debut}–${debut + n - 1} sur ${total.value}` : `0 sur ${total.value}`
  })
  return { page, total, pages, lignesPage, plage }
}
