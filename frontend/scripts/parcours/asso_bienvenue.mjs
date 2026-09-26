// Parcours de /asso/bienvenue (MgOnboarding) : étapes 1 à 4, données pré-remplies de l'association.
const suivant = async (page, libelle = 'Continuer') => {
  await page.getByRole('button', { name: libelle }).filter({ visible: true }).first().click()
  await page.waitForTimeout(500) // enregistrement (latence simulée)
}

export default {
  '1-bienvenue': async () => {},
  '2-association': async (page) => {
    await suivant(page, 'Commencer')
  },
  '3-paiements': async (page) => {
    await suivant(page, 'Commencer')
    await suivant(page)
  },
  '4-pret': async (page) => {
    await suivant(page, 'Commencer')
    await suivant(page)
    await suivant(page)
  },
}
