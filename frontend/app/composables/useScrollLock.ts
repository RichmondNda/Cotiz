// Bloque le défilement de la page tant qu'une superposition est ouverte (compteur partagé).
import type { Ref } from 'vue'

let verrous = 0

export function useScrollLock(actif: Ref<boolean>) {
  let tenu = false
  const appliquer = (v: boolean) => {
    if (!import.meta.client || v === tenu) return
    tenu = v
    verrous += v ? 1 : -1
    document.documentElement.style.overflow = verrous > 0 ? 'hidden' : ''
  }
  watch(actif, appliquer, { immediate: true })
  onBeforeUnmount(() => appliquer(false))
}
