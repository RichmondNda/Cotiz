// Parcours de /bienvenue (MbOnboarding) : diapositives 1 à 3.
const suivant = page => page.getByRole('button', { name: 'Suivant' }).click()

export default {
  1: async () => {},
  2: suivant,
  3: async (page) => {
    await suivant(page)
    await suivant(page)
  },
}
