// Parcours de /plateforme/associations/nouvelle (SaNouvelleAssociation).
async function remplir(page, { nom = 'Jeunesse solidaire de Bouaké', email = '[email]', telephone = '[XX XX XX XX XX]' } = {}) {
  // Libellés des champs obligatoires suivis de l'astérisque.
  const champ = label => page.getByLabel(new RegExp(`^${label}\\s*\\*?$`))
  if (nom) await champ('Nom de l’association').fill(nom)
  await champ('Ville').fill('Bouaké')
  await champ('Prénom').fill('[Prénom]')
  await champ('Nom').fill('[Nom]')
  await champ('Email').fill(email)
  await champ('Téléphone').fill(telephone)
}

export default {
  'rempli': async (page) => {
    await remplir(page)
  },
  'erreurs': async (page) => {
    // Le champ téléphone ne garde que les chiffres : un numéro réel remplace le placeholder de la maquette.
    await remplir(page, { nom: '', email: 'contact@jeunesse', telephone: '07 12 34 56 78' })
    await page.getByRole('button', { name: 'Créer l’association' }).click()
    await page.waitForTimeout(400)
    await page.evaluate(() => window.scrollTo(0, 0))
  },
  // Envoi valide, réponse de l'API retenue : bouton « Création… ».
  'envoi-en-cours': async (page) => {
    await page.route('**/api/v1/platform/associations', route => (route.request().method() === 'POST' ? new Promise(() => {}) : route.continue()))
    await remplir(page, { email: 'contact@jeunesse.ci', telephone: '07 12 34 56 78' })
    await page.getByRole('button', { name: 'Créer l’association' }).click()
  },
}
