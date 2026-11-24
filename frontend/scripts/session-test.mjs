// Session des outils de vérification (capture d'écran, parcours e2e) : ouvre un espace protégé dans un contexte
// Playwright, par la vraie page de connexion de l'espace (tous les espaces sont basculés depuis le lot 1.2) avec les
// comptes de développement (backend : `COTIZ_DEV_SEED=1 pnpm --filter backend cli seed-dev`). Exige l'api NestJS,
// PostgreSQL et Redis lancés. Le cookie de renouvellement reste dans le contexte : chaque page rouvre la session sans
// se reconnecter. Comptes : CAPTURE_<ROLE>_IDENTIFIANT / CAPTURE_<ROLE>_PASSWORD (par défaut ceux de seed-dev,
// server/mocks/IDENTIFIANTS.md).

import { createHmac } from 'node:crypto'

const DEV_PASSWORD = 'Plateau-Dev-Cotiz-2026'
/**
 * Secret TOTP du super-admin de seed-dev (DEV_TOTP_SECRET, backend/src/modules/identity/application/
 * seed-dev-accounts.use-case.ts) : double authentification obligatoire pour la plateforme depuis le lot 4.7.
 */
const DEV_TOTP_SECRET = 'KRUGKIDROVUWG2ZAMJZG653OEBTG66BA'

/** Compte, page de connexion, champ d'identifiant, bouton et page d'arrivée de chaque espace. */
export const COMPTES = {
  superadmin: {
    identifiant: process.env.CAPTURE_SUPERADMIN_EMAIL ?? 'richy@cotiz.app',
    password: process.env.CAPTURE_SUPERADMIN_PASSWORD ?? DEV_PASSWORD,
    page: '/connexion/plateforme', champ: 'Email', bouton: 'Se connecter', arrivee: '/plateforme',
    totp: process.env.CAPTURE_SUPERADMIN_TOTP_SECRET ?? DEV_TOTP_SECRET,
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

// ---------------------------------------------------------------- Second facteur (TOTP, RFC 6238)

function base32(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = 0
  let valeur = 0
  const octets = []
  for (const c of secret.replace(/[\s=]/g, '').toUpperCase()) {
    valeur = (valeur << 5) | alphabet.indexOf(c)
    bits += 5
    if (bits >= 8) {
      octets.push((valeur >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(octets)
}

function codeTotp(secret, pas) {
  const message = Buffer.alloc(8)
  message.writeBigUInt64BE(BigInt(pas))
  const empreinte = createHmac('sha1', base32(secret)).update(message).digest()
  const decalage = empreinte[empreinte.length - 1] & 0x0f
  return String((empreinte.readUInt32BE(decalage) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

/**
 * Un code TOTP ne sert qu'une fois (le back refuse le rejeu d'un pas) : les connexions de ce processus se suivent
 * (file d'attente) et chacune attend un pas de 30 s encore inutilisé.
 */
let dernierPas = 0
let fileTotp = Promise.resolve()
function prochainCodeTotp(secret) {
  const tour = fileTotp.then(async () => {
    let pas = Math.floor(Date.now() / 30_000)
    if (pas <= dernierPas) {
      await new Promise(r => setTimeout(r, (dernierPas + 1) * 30_000 - Date.now() + 200))
      pas = Math.floor(Date.now() / 30_000)
    }
    dernierPas = pas
    return codeTotp(secret, pas)
  })
  fileTotp = tour.then(() => undefined, () => undefined)
  return tour
}

/** Étape « Code de vérification » de /connexion/plateforme ; deux essais (pas déjà servi par un autre processus). */
async function passerSecondFacteur(page, secret) {
  await page.getByText('Code de vérification').waitFor({ timeout: 15_000 })
  for (let essai = 0; essai < 2; essai++) {
    await page.getByLabel('Chiffre 1').fill(await prochainCodeTotp(secret))
    const reponse = page.waitForResponse('**/api/v1/auth/mfa/verify')
    await page.getByRole('button', { name: 'Valider' }).click()
    if ((await reponse).ok()) return
  }
  throw new Error('second facteur refusé (secret TOTP : CAPTURE_SUPERADMIN_TOTP_SECRET)')
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
    if (compte.totp) await passerSecondFacteur(page, compte.totp)
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
