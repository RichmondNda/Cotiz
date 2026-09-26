// Piège le focus dans un conteneur (modale, feuille, panneau, tiroir) tant qu'il est actif :
// focus initial sur le premier élément focalisable, Tab / Maj+Tab bouclent, Échap ferme,
// et le focus revient à l'élément déclencheur à la fermeture.
import type { Ref } from 'vue'

const FOCALISABLES = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export function elementsFocalisables(racine: HTMLElement): HTMLElement[] {
  return Array.from(racine.querySelectorAll<HTMLElement>(FOCALISABLES))
    .filter(el => !el.hasAttribute('disabled') && el.getClientRects().length > 0)
}

export function useFocusTrap(conteneur: Ref<HTMLElement | null | undefined>, actif: Ref<boolean>, onEchap?: () => void) {
  let precedent: HTMLElement | null = null

  function surTouche(e: KeyboardEvent) {
    const el = conteneur.value
    if (!el) return
    if (e.key === 'Escape' && onEchap) {
      e.stopPropagation()
      onEchap()
      return
    }
    if (e.key !== 'Tab') return
    const liste = elementsFocalisables(el)
    if (liste.length === 0) {
      e.preventDefault()
      el.focus()
      return
    }
    const premier = liste[0]!
    const dernier = liste[liste.length - 1]!
    if (e.shiftKey && document.activeElement === premier) {
      e.preventDefault()
      dernier.focus()
    }
    else if (!e.shiftKey && document.activeElement === dernier) {
      e.preventDefault()
      premier.focus()
    }
  }

  watch(actif, async (ouvert) => {
    if (!import.meta.client) return
    if (ouvert) {
      precedent = document.activeElement as HTMLElement | null
      await nextTick()
      const el = conteneur.value
      if (!el) return
      el.addEventListener('keydown', surTouche)
      const cible = el.querySelector<HTMLElement>('[autofocus]') ?? elementsFocalisables(el)[0] ?? el
      cible.focus()
    }
    else {
      conteneur.value?.removeEventListener('keydown', surTouche)
      precedent?.focus?.()
      precedent = null
    }
  }, { immediate: true })

  onBeforeUnmount(() => {
    conteneur.value?.removeEventListener('keydown', surTouche)
    if (actif.value) precedent?.focus?.()
  })
}
