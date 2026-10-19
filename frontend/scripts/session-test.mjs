// Session des outils de vérification (capture d'écran, parcours e2e) : ouvre un espace protégé dans un contexte
// Playwright.
// - Espaces encore simulés (gestionnaire, souscripteur) : cookie `cotiz_role`, comme en V0.
// - Espace basculé (plateforme, lot 1.1) : vraie connexion par /connexion/plateforme avec le compte de développement
//   (backend : `COTIZ_DEV_SEED=1 pnpm --filter backend cli seed-dev`). Exige l'api NestJS, PostgreSQL et Redis lancés. Le cookie de
//   renouvellement reste dans le contexte : chaque page rouvre la session sans se reconnecter.
// Compte : CAPTURE_SUPERADMIN_EMAIL / CAPTURE_SUPERADMIN_PASSWORD (par défaut ceux de seed-dev, IDENTIFIANTS.md).

export const SUPERADMIN = {
  email: process.env.CAPTURE_SUPERADMIN_EMAIL ?? 'richy@cotiz.app',
  password: process.env.CAPTURE_SUPERADMIN_PASSWORD ?? 'Plateau-Dev-Cotiz-2026',
}

/** Ouvre la session de `role` dans le contexte (`null` ou `'null'` : visiteur). Lève une erreur si elle échoue. */
export async function ouvrirSession(ctx, role, base) {
  if (!role || role === 'null') return
  if (role !== 'superadmin') {
    await ctx.addCookies([{ name: 'cotiz_role', value: role, url: base }])
    return
  }
  const page = await ctx.newPage()
  try {
    await page.goto(new URL('/connexion/plateforme', base).toString(), { waitUntil: 'networkidle' })
    await page.getByLabel('Email', { exact: true }).fill(SUPERADMIN.email)
    await page.getByLabel('Mot de passe', { exact: true }).fill(SUPERADMIN.password)
    await page.getByRole('button', { name: 'Se connecter' }).click()
    await page.waitForURL(url => new URL(url).pathname.startsWith('/plateforme'), { timeout: 15_000 })
  }
  catch (e) {
    throw new Error(
      `Connexion plateforme impossible (${SUPERADMIN.email}) : api NestJS lancée et compte créé par `
      + '« COTIZ_DEV_SEED=1 pnpm --filter backend cli seed-dev » ?',
      { cause: e },
    )
  }
  finally {
    await page.close()
  }
}
