// Session des outils de vérification (capture d'écran, parcours e2e) : ouvre un espace protégé dans un contexte
// Playwright, par la vraie page de connexion de l'espace (tous les espaces sont basculés depuis le lot 1.2) avec les
// comptes de développement (backend : `COTIZ_DEV_SEED=1 pnpm --filter backend cli seed-dev`). Exige l'api NestJS,
// PostgreSQL et Redis lancés. Le cookie de renouvellement reste dans le contexte : chaque page rouvre la session sans
// se reconnecter. Comptes : CAPTURE_<ROLE>_IDENTIFIANT / CAPTURE_<ROLE>_PASSWORD (par défaut ceux de seed-dev,
// server/mocks/IDENTIFIANTS.md).

const DEV_PASSWORD = 'Plateau-Dev-Cotiz-2026'

/** Compte, page de connexion, champ d'identifiant, bouton et page d'arrivée de chaque espace. */
export const COMPTES = {
  superadmin: {
    identifiant: process.env.CAPTURE_SUPERADMIN_EMAIL ?? 'richy@cotiz.app',
    password: process.env.CAPTURE_SUPERADMIN_PASSWORD ?? DEV_PASSWORD,
    page: '/connexion/plateforme', champ: 'Email', bouton: 'Se connecter', arrivee: '/plateforme',
  },
  gestionnaire: {
    identifiant: process.env.CAPTURE_GESTIONNAIRE_IDENTIFIANT ?? 'awa@entraide.ci',
    password: process.env.CAPTURE_GESTIONNAIRE_PASSWORD ?? DEV_PASSWORD,
    page: '/connexion/association', champ: 'Email', bouton: 'Se connecter', arrivee: '/asso',
  },
  souscripteur: {
    identifiant: process.env.CAPTURE_SOUSCRIPTEUR_IDENTIFIANT ?? '0544218790',
    password: process.env.CAPTURE_SOUSCRIPTEUR_PASSWORD ?? DEV_PASSWORD,
    page: '/connexion', champ: 'Téléphone', bouton: 'Me connecter', arrivee: '/accueil',
  },
}

/** Ouvre la session de `role` dans le contexte (`null` ou `'null'` : visiteur). Lève une erreur si elle échoue. */
export async function ouvrirSession(ctx, role, base) {
  if (!role || role === 'null') return
  const compte = COMPTES[role]
  if (!compte) throw new Error(`Rôle inconnu : ${role}`)
  // Flux temps réel (nt.stream, lot 4.2) : connexion SSE toujours ouverte, le réseau n'est jamais au repos
  // (`networkidle` des captures et des e2e). Coupé dans ces outils ; la cloche se lit comme avant.
  await ctx.route('**/api/v1/me/notifications/stream', route => route.fulfill({ status: 204 }))
  const page = await ctx.newPage()
  try {
    await page.goto(new URL(compte.page, base).toString(), { waitUntil: 'networkidle' })
    await page.getByLabel(compte.champ, { exact: true }).fill(compte.identifiant)
    await page.getByLabel('Mot de passe', { exact: true }).fill(compte.password)
    await page.getByRole('button', { name: compte.bouton }).click()
    await page.waitForURL(url => new URL(url).pathname.startsWith(compte.arrivee), { timeout: 15_000 })
  }
  catch (e) {
    throw new Error(
      `Connexion ${role} impossible (${compte.identifiant}) : api NestJS lancée et comptes créés par `
      + '« COTIZ_DEV_SEED=1 pnpm --filter backend cli seed-dev » ?',
      { cause: e },
    )
  }
  finally {
    await page.close()
  }
}
