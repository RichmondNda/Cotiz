// Parcours de /asso/equipe (MgEquipe).
const ouvrir = async (page) => {
  await page.getByRole('button', { name: 'Inviter un gestionnaire' }).filter({ visible: true }).first().click()
  await page.waitForTimeout(400)
}
export default {
  'modale-invitation': ouvrir,
  'invitation': ouvrir,
}
