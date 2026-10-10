// Rapports d'erreurs du front vers GlitchTip (SDK Sentry, auto-hébergé ; docs/architecture/11-ops.md). Inactif sans
// DSN : le SDK n'est même pas chargé. Avec : version déployée, requestId de l'appel en échec (le support le retrouve
// dans les journaux et les traces), aucune donnée personnelle (requête, utilisateur, fil d'Ariane, téléphones).
import { ApiError } from '@cotiz/api-client'

const MASQUE = '[masqué]'
/** Mêmes motifs que les journaux du back (backend/src/shared/logging/redaction.ts). */
const TELEPHONES = [
  /(?<![\w+:-])\+\d{1,3}(?:[ .-]?\d){6,14}(?![\w:-])/g,
  /(?<![\w+:-])0\d(?:[ .-]?\d{2}){4}(?![\w:-])/g,
]

export function masquerTelephones(texte: string): string {
  return TELEPHONES.reduce((t, motif) => t.replace(motif, MASQUE), texte)
}

/** requestId d'une erreur d'appel : ApiError, erreur Nuxt (`data` = Problem) ou leur `cause`. */
export function requestIdDe(erreur: unknown, profondeur = 0): string | undefined {
  if (profondeur > 4 || erreur === null || typeof erreur !== 'object') return undefined
  if (erreur instanceof ApiError) return erreur.requestId ?? undefined
  const data = (erreur as { data?: { requestId?: unknown } }).data
  if (typeof data?.requestId === 'string') return data.requestId
  return requestIdDe((erreur as { cause?: unknown }).cause, profondeur + 1)
}

interface Evenement {
  message?: string
  request?: { url?: string } & Record<string, unknown>
  user?: unknown
  breadcrumbs?: unknown
  exception?: { values?: { type?: string, value?: string }[] }
  tags?: Record<string, unknown>
  contexts?: Record<string, unknown> & { vue?: Record<string, unknown> }
  extra?: unknown
}

/**
 * `beforeSend` : ni requête (en-têtes, cookies, query string), ni utilisateur, ni fil d'Ariane, ni props de composant
 * (code d'activation, téléphone, montants), ni données libres ; seul le nom du composant reste. requestId en étiquette.
 */
export function nettoyerEvenement<E extends Evenement>(evenement: E, indice?: { originalException?: unknown }): E {
  if (evenement.request) evenement.request = { ...(evenement.request.url ? { url: evenement.request.url.replace(/[?#].*$/, '') } : {}) }
  delete evenement.user
  delete evenement.breadcrumbs
  delete evenement.extra
  const vue = evenement.contexts?.vue
  if (evenement.contexts && vue) {
    evenement.contexts.vue = typeof vue.componentName === 'string' ? { componentName: vue.componentName } : {}
  }
  if (evenement.message) evenement.message = masquerTelephones(evenement.message)
  for (const valeur of evenement.exception?.values ?? []) {
    if (valeur.value) valeur.value = masquerTelephones(valeur.value)
  }
  const requestId = requestIdDe(indice?.originalException)
  if (requestId) evenement.tags = { ...evenement.tags, requestId }
  return evenement
}

/**
 * Aucune donnée collectée automatiquement par le SDK (Sentry 11 collecte tout par défaut) : ni utilisateur, ni
 * cookies, en-têtes, corps, query string, variables ou lignes de code source.
 */
export const AUCUNE_COLLECTE = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
  frameContextLines: 0,
}

/** Sous-ensemble du SDK utilisé (chargé à la demande). */
interface Sdk {
  init(options: Record<string, unknown>): unknown
  vueIntegration?: (options?: Record<string, unknown>) => unknown
  globalHandlersIntegration?: () => unknown
}

/**
 * Démarre GlitchTip si un DSN est configuré (NUXT_PUBLIC_GLITCHTIP_DSN) ; renvoie `false` sinon. Intégrations
 * limitées aux erreurs Vue et globales : ni suivi de performance, ni rejeu de session, ni fil d'Ariane.
 */
export async function demarrerGlitchtip(options: { dsn: string, version: string, app: unknown, charger: () => Promise<Sdk> }): Promise<boolean> {
  if (!options.dsn) return false
  const sdk = await options.charger()
  sdk.init({
    app: options.app,
    dsn: options.dsn,
    release: options.version,
    dataCollection: AUCUNE_COLLECTE,
    defaultIntegrations: false,
    // attachProps : par défaut, @sentry/vue joint les props du composant en erreur.
    integrations: [sdk.vueIntegration?.({ attachProps: false }), sdk.globalHandlersIntegration?.()].filter(Boolean),
    beforeSend: (evenement: Evenement, indice?: { originalException?: unknown }) => nettoyerEvenement(evenement, indice),
    beforeBreadcrumb: () => null,
  })
  return true
}
