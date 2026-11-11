// Notifications push sur cet appareil (me.push, lot 4.2) : Web Push standard, sans fournisseur. Le navigateur fournit
// l'abonnement (URL du service de push et clés de chiffrement), Cotiz l'enregistre ; le service worker `/sw.js` affiche
// les messages. L'identifiant de l'abonnement est gardé dans l'appareil pour pouvoir le retirer (désactivation,
// déconnexion : sur un téléphone partagé, la personne suivante ne reçoit pas les notifications de la précédente).
// États : `indisponible` (navigateur sans push, endpoint ou fonctionnalité `web_push` absents), `a-installer` (iPhone :
// le push ne marche que depuis l'écran d'accueil), `refuse` (permission refusée dans le navigateur), `inactif`, `actif`.
import { ApiError } from '@cotiz/api-client'
import { espaceBascule, type Espace } from '~/utils/bascule'
import { REAL_ENDPOINTS } from '~~/server/bascule/real-endpoints'

export type EtatPushAppareil = 'chargement' | 'indisponible' | 'a-installer' | 'refuse' | 'inactif' | 'actif'

const CLE_ABONNEMENT = 'cotiz_push_abonnement'
const SERVICE_WORKER = '/sw.js'

const lireId = () => {
  try {
    return localStorage.getItem(CLE_ABONNEMENT)
  }
  catch {
    return null
  }
}
const ecrireId = (id: string | null) => {
  try {
    if (id) localStorage.setItem(CLE_ABONNEMENT, id)
    else localStorage.removeItem(CLE_ABONNEMENT)
  }
  catch {
    // stockage indisponible (navigation privée) : l'abonnement reste retirable par le navigateur
  }
}

const pushPossible = () =>
  import.meta.client && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

/** iPhone / iPad hors application installée : `PushManager` absent tant que Cotiz n'est pas sur l'écran d'accueil. */
const iosAInstaller = () =>
  import.meta.client
    && /iPhone|iPad|iPod/.test(navigator.userAgent)
    && !window.matchMedia('(display-mode: standalone)').matches

/** Clé VAPID (base64url) → octets attendus par `pushManager.subscribe`. */
function octetsCle(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64url.length / 4) * 4, '=')
  const brut = atob(base64)
  const octets = new Uint8Array(new ArrayBuffer(brut.length))
  for (let i = 0; i < brut.length; i++) octets[i] = brut.charCodeAt(i)
  return octets
}

const dejaEnregistre = (e: unknown) =>
  e instanceof ApiError && e.status === 422 && e.problem?.fields?.endpoint === 'already_registered'

export function usePushAppareil(espace: Espace) {
  const client = useClient()
  const { active, pret } = usePermissions()
  const etat = ref<EtatPushAppareil>('chargement')
  const envoi = ref(false)

  // Session réelle seulement : me.push n'a pas de handler simulé (le `/me` simulé annonce pourtant `web_push`).
  const disponible = () => espaceBascule(espace) && REAL_ENDPOINTS.has('me.push') && active('web_push')

  async function abonnementActuel() {
    const enregistrement = await navigator.serviceWorker.getRegistration('/')
    return (await enregistrement?.pushManager.getSubscription()) ?? null
  }

  async function lire() {
    if (!pret.value) return
    if (!disponible()) {
      etat.value = 'indisponible'
      return
    }
    if (!pushPossible()) {
      etat.value = iosAInstaller() ? 'a-installer' : 'indisponible'
      return
    }
    if (Notification.permission === 'denied') {
      etat.value = 'refuse'
      return
    }
    const abonnement = await abonnementActuel().catch(() => null)
    etat.value = abonnement && lireId() ? 'actif' : 'inactif'
  }

  async function enregistrer(abonnement: PushSubscription) {
    const json = abonnement.toJSON()
    const { id } = await client.call('me.push', 'subscribe', {
      body: { endpoint: abonnement.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } },
    })
    ecrireId(id)
  }

  /** Demande la permission, abonne l'appareil et l'enregistre. Renvoie `false` si la personne refuse. */
  async function activer(): Promise<boolean> {
    envoi.value = true
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        await lire()
        return false
      }
      const enregistrement = await navigator.serviceWorker.register(SERVICE_WORKER, { scope: '/' })
      await navigator.serviceWorker.ready
      const { publicKey } = await client.call('me.push', 'vapidKey')
      const options = { userVisibleOnly: true, applicationServerKey: octetsCle(publicKey) }
      let abonnement = await enregistrement.pushManager.subscribe(options)
      try {
        await enregistrer(abonnement)
      }
      catch (e) {
        // Appareil partagé : cette URL est enregistrée par une autre personne. Un nouvel abonnement donne une
        // nouvelle URL ; l'ancienne cesse de fonctionner, et son enregistrement est retiré au prochain envoi.
        if (!dejaEnregistre(e)) throw e
        await abonnement.unsubscribe()
        abonnement = await enregistrement.pushManager.subscribe(options)
        await enregistrer(abonnement)
      }
      etat.value = 'actif'
      return true
    }
    finally {
      envoi.value = false
    }
  }

  async function desactiver() {
    envoi.value = true
    try {
      await oublierAppareil(client)
      etat.value = 'inactif'
    }
    finally {
      envoi.value = false
    }
  }

  onMounted(() => void lire())
  watch(pret, () => void lire())

  return { etat, envoi, activer, desactiver }
}

/**
 * Retire l'abonnement de cet appareil (Cotiz puis navigateur). Appelé à la désactivation et à la déconnexion, tant que
 * le jeton est encore valable ; un échec réseau n'empêche pas de se déconnecter.
 */
export async function oublierAppareil(client: ReturnType<typeof useClient>): Promise<void> {
  if (!pushPossible()) return
  const id = lireId()
  ecrireId(null)
  if (id) await client.call('me.push', 'unsubscribe', { params: { id } }).catch(() => undefined)
  const enregistrement = await navigator.serviceWorker.getRegistration('/').catch(() => undefined)
  const abonnement = await enregistrement?.pushManager.getSubscription().catch(() => null)
  await abonnement?.unsubscribe().catch(() => false)
}
