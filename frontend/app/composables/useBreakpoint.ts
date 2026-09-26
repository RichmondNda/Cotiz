// Points de rupture Cotiz : mobile < 768 px, tablette < 1024 px, desktop au-delà.
// Côté serveur, on suppose le desktop ; la valeur réelle est lue au montage.
// Pour la mise en page, préférer les media queries CSS (pas de décalage d'hydratation) ;
// ce composable sert aux comportements (modale → feuille basse, etc.).

export const BREAKPOINT_MOBILE = 768
export const BREAKPOINT_TABLETTE = 1024

export function useBreakpoint() {
  const largeur = useState('cz-largeur-fenetre', () => BREAKPOINT_TABLETTE + 1)

  if (import.meta.client) {
    const mettreAJour = () => (largeur.value = window.innerWidth)
    onMounted(() => {
      mettreAJour()
      window.addEventListener('resize', mettreAJour, { passive: true })
    })
    onBeforeUnmount(() => window.removeEventListener('resize', mettreAJour))
  }

  return {
    largeur,
    estMobile: computed(() => largeur.value < BREAKPOINT_MOBILE),
    estTablette: computed(() => largeur.value >= BREAKPOINT_MOBILE && largeur.value < BREAKPOINT_TABLETTE),
    estDesktop: computed(() => largeur.value >= BREAKPOINT_TABLETTE),
  }
}
