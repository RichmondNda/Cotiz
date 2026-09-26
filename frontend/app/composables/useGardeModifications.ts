// Garde de navigation d'un formulaire modifié et non enregistré (paramètres, profil…).
// Changement de page dans l'app → confirmation (`confirmation` à lier à une CzConfirmation, `quitter()` pour confirmer) ;
// fermeture ou rechargement de l'onglet → confirmation native du navigateur.

export function useGardeModifications(modifie: () => boolean) {
  const router = useRouter()
  const confirmation = ref(false)
  const destination = ref<string | null>(null)
  let autorise = false

  function avantDechargement(e: BeforeUnloadEvent) {
    if (!modifie()) return
    e.preventDefault()
    e.returnValue = ''
  }
  onMounted(() => window.addEventListener('beforeunload', avantDechargement))
  onBeforeUnmount(() => window.removeEventListener('beforeunload', avantDechargement))

  onBeforeRouteLeave((to) => {
    if (autorise || !modifie()) return true
    destination.value = to.fullPath
    confirmation.value = true
    return false
  })

  /** Quitte la page en abandonnant les modifications. */
  async function quitter() {
    if (!destination.value) return
    autorise = true
    confirmation.value = false
    await router.push(destination.value)
  }

  return { confirmation, quitter }
}
