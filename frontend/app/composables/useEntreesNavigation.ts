// Logique commune des menus (barres latérales, navigation basse) : entrée active pour la route courante
// et compteur à afficher (API mockée). Le rendu reste propre à chaque menu.
import type { MaybeRefOrGetter } from 'vue'
import { estEntreeActive, type EntreeNavigation } from '~/config/navigation'

export function useEntreesNavigation(
  /** Chemins supplémentaires qui activent une entrée (ex. /projets/** → « Projets » du souscripteur). */
  alias: MaybeRefOrGetter<Record<string, string[]>> = {},
) {
  const route = useRoute()
  const { data: compteurs } = useCompteursNavigation()

  function actif(e: EntreeNavigation) {
    return estEntreeActive(e, route.path)
      || (toValue(alias)[e.cle] ?? []).some(p => route.path === p || route.path.startsWith(`${p}/`))
  }

  /** Valeur du compteur de l'entrée ; `undefined` si pas de compteur ou s'il vaut 0. */
  function compteur(e: EntreeNavigation) {
    return e.compteur ? compteurs.value?.[e.compteur] || undefined : undefined
  }

  return { actif, compteur }
}
