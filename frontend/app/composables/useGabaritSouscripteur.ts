// Réglages du gabarit souscripteur pilotés par la page en cours, quand ils dépendent de son état
// (ex. contrat en lecture : la barre de signature collante remplace la navigation basse).
// Pour un réglage fixe, préférer `definePageMeta({ fab: false, navBasse: false })`.
export function useGabaritSouscripteur() {
  const navMasquee = useState('souscripteur-nav-masquee', () => false)

  /** Masque la navigation basse tant que `condition` est vraie et que la page est affichée. */
  function masquerNavBasse(condition: MaybeRefOrGetter<boolean>) {
    watch(() => toValue(condition), v => (navMasquee.value = v), { immediate: true })
    onBeforeUnmount(() => (navMasquee.value = false))
  }

  return { navMasquee, masquerNavBasse }
}
