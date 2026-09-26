// Parcours de /paiements/declarer (MbDeclarer). Projet par défaut : Centre communautaire (en retard).

async function projet(page) {
  await page.getByRole('radio', { name: /Centre communautaire/ }).click()
  await page.getByRole('button', { name: 'Continuer' }).click()
}

async function montant(page, valeur) {
  await projet(page)
  if (valeur) await page.getByLabel('Montant versé').fill(valeur)
  else await page.getByRole('button', { name: /3 mois/ }).click()
}

async function preuve(page) {
  await montant(page)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByLabel('Référence de la transaction').fill('MP260925.1042.A71')
}

async function recap(page) {
  await preuve(page)
  await page.locator('input[type="file"]:not([capture])').setInputFiles({ name: 'capture-paiement.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(412 * 1024) })
  await page.getByRole('button', { name: 'Continuer' }).click()
}

export default {
  'etape-projet': page => page.getByRole('radio', { name: /Centre communautaire/ }).click(),
  'etape-montant': page => montant(page),
  'etape-preuve': preuve,
  'etape-recap': recap,
  // MbDeclarerOk : envoi de la déclaration, capture de la page de confirmation.
  'envoye': async (page) => {
    await recap(page)
    await page.getByRole('button', { name: 'Envoyer ma déclaration' }).click()
    await page.getByRole('heading', { name: 'Déclaration envoyée !' }).waitFor()
  },
  'cas-paiement-partiel': page => montant(page, '60000'),
  'cas-montant-trop-eleve': page => montant(page, '350000'),
}
