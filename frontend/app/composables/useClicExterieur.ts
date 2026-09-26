// Appelle `rappel` lors d'un clic (pointerdown) en dehors des éléments donnés, tant que `actif` est vrai.
import type { Ref } from 'vue'

export function useClicExterieur(elements: Ref<HTMLElement | null | undefined>[], actif: Ref<boolean>, rappel: () => void) {
  function surClic(e: PointerEvent) {
    const cible = e.target as Node
    if (elements.some(el => el.value?.contains(cible))) return
    rappel()
  }
  watch(actif, (v) => {
    if (!import.meta.client) return
    if (v) setTimeout(() => document.addEventListener('pointerdown', surClic), 0)
    else document.removeEventListener('pointerdown', surClic)
  })
  onBeforeUnmount(() => {
    if (import.meta.client) document.removeEventListener('pointerdown', surClic)
  })
}
