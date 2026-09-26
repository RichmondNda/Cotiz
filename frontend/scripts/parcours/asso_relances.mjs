// Parcours de /asso/relances (MgRelances).
const cocher = async (page, mobile) => {
  for (const nom of ['Moussa Diarra', 'Koffi Brou', 'Jean Kouassi']) {
    if (mobile) await page.getByRole('checkbox', { name: `Sélectionner ${nom}` }).check({ force: true })
    else await page.getByRole('row', { name: new RegExp(nom) }).getByRole('checkbox').check({ force: true })
  }
}
export default {
  'modale-relance': async (page, { mobile }) => {
    await cocher(page, mobile)
    await page.getByRole('button', { name: mobile ? /Relancer 3 souscripteur/ : 'Relancer maintenant' }).click()
    await page.waitForTimeout(400)
  },
  'relance-envoyee': async (page, { mobile }) => {
    await cocher(page, mobile)
    await page.getByRole('button', { name: mobile ? /Relancer 3 souscripteur/ : 'Relancer maintenant' }).click()
    await page.waitForTimeout(300)
    await page.getByRole('button', { name: 'Envoyer la relance' }).click()
    await page.waitForTimeout(1200)
  },
}
