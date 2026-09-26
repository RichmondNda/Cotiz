// Parcours de /asso/projets/centre-communautaire/souscripteurs (MgProjetSouscripteurs, MgAjoutSouscripteur).
// Numéros mockés : server/mocks/IDENTIFIANTS.md.
const ouvrirAjout = async (page, mobile) => {
  await page.getByRole('button', { name: mobile ? '+ Ajouter' : 'Ajouter un souscripteur', exact: true }).first().click()
  await page.waitForTimeout(300)
}
const saisir = async (page, tel) => {
  await page.getByRole('textbox', { name: 'Téléphone' }).fill(tel)
}
const chercher = async (page, mobile) => {
  await page.getByRole('button', { name: mobile ? 'Rechercher' : 'Continuer', exact: true }).click()
  await page.waitForTimeout(700)
}

export default {
  'selection-multiple': async (page, { mobile }) => {
    if (mobile) return
    const cases = page.getByRole('checkbox', { name: 'Sélectionner la ligne' })
    for (const i of [0, 1, 6]) await cases.nth(i).check({ force: true })
  },
  'telephone': async (page, { mobile }) => {
    await ouvrirAjout(page, mobile)
    await saisir(page, '07 12 34 56 78')
  },
  'compte-existant': async (page, { mobile }) => {
    await ouvrirAjout(page, mobile)
    await saisir(page, '01 00 00 00 01')
    await chercher(page, mobile)
  },
  'nouveau': async (page, { mobile }) => {
    await ouvrirAjout(page, mobile)
    await saisir(page, '07 12 34 56 78')
    await chercher(page, mobile)
    if (!mobile) {
      await page.getByRole('textbox', { name: 'Prénom' }).fill('Aïcha')
      await page.getByRole('textbox', { name: 'Nom', exact: true }).fill('Bamba')
    }
  },
  'deja-inscrit': async (page, { mobile }) => {
    await ouvrirAjout(page, mobile)
    await saisir(page, '05 44 21 87 90')
    await chercher(page, mobile)
  },
  'retrait-confirmation': async (page, { mobile }) => {
    if (mobile) await page.getByRole('button', { name: 'Retirer Moussa Diarra du projet' }).click()
    else {
      await page.getByRole('button', { name: 'Actions sur Moussa Diarra' }).click()
      await page.getByRole('menuitem', { name: 'Retirer du projet' }).click()
    }
    await page.waitForTimeout(300)
  },
}
