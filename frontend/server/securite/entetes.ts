// En-têtes de sécurité du front (architecture/02 « En-têtes » : CSP stricte, X-Frame-Options DENY, Referrer-Policy ;
// HSTS posé par Traefik au lot 7.1). Fonctions pures, appliquées par server/plugins/securite.ts, testées seules.

/** Sur toutes les réponses du front (pages, fichiers, `/api/v1` transmis à NestJS). */
export const ENTETES_SECURITE: Readonly<Record<string, string>> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Opener-Policy': 'same-origin',
  // Ressources du front lues par lui seul (isolation contre Spectre, alerte ZAP 90004).
  'Cross-Origin-Resource-Policy': 'same-origin',
  // Appareil photo : preuve prise depuis le téléphone (`<input capture>`, même origine) ; le reste fermé.
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()',
}

export interface OriginesAutorisees {
  /** Origine publique du stockage (URL signées d'une preuve suivies par le navigateur), ex. `https://fichiers.cotiz.app`. */
  stockage?: string
  /** DSN GlitchTip (lot 0.6) : son origine reçoit les rapports d'erreur du navigateur. */
  glitchtipDsn?: string
}

/** Origine d'une URL (`https://hote:port`), ou `null` si elle est vide ou illisible. */
export function origineDe(url: string | undefined): string | null {
  if (!url) return null
  try {
    const { origin } = new URL(url)
    return origin === 'null' ? null : origin
  }
  catch {
    return null
  }
}

/**
 * Politique de contenu d'une page : scripts et balises `<style>` de la même origine ou porteurs du nonce de la requête
 * (scripts en ligne de Nuxt), aucun `eval` ; seuls les attributs `style` des composants restent permis en ligne
 * (`style-src-attr`) ; images, aperçus et PDF de preuve
 * en `blob:` (lus avec le jeton, lot 3.4) et QR codes en `data:` ; connexions vers la même origine, le stockage et
 * GlitchTip seulement ; aucun encadrement de la page.
 */
export function politiqueContenu(nonce: string, origines: OriginesAutorisees = {}): string {
  if (!/^[A-Za-z0-9+/=_-]{16,}$/.test(nonce)) throw new Error('nonce invalide')
  const connexions = ['\'self\'', origineDe(origines.stockage), origineDe(origines.glitchtipDsn)].filter(Boolean)
  return [
    'default-src \'self\'',
    `script-src 'self' 'nonce-${nonce}'`,
    `style-src 'self' 'nonce-${nonce}'`,
    'style-src-attr \'unsafe-inline\'',
    'img-src \'self\' data: blob:',
    'font-src \'self\'',
    `connect-src ${[...new Set(connexions)].join(' ')}`,
    'worker-src \'self\' blob:',
    'frame-src \'self\' blob:',
    'object-src \'none\'',
    'base-uri \'self\'',
    'form-action \'self\'',
    'frame-ancestors \'none\'',
  ].join('; ')
}

/** Ajoute le nonce à chaque balise `<script` et `<style` d'un fragment HTML qui n'en porte pas déjà un. */
export function avecNonce(html: string, nonce: string): string {
  return html.replace(/<(script|style)\b(?![^>]*\bnonce=)/g, `<$1 nonce="${nonce}"`)
}
