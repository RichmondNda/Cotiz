// Fiches d'activation imprimables (A6, docs/specs/ui-deviations.md › HandoffCard) : nom de l'association, destinataire,
// lien et QR d'activation (le QR ne porte que le lien, jamais le code), code et expiration. Le QR est calculé dans le
// navigateur (`qrcode`, aucun service tiers) ; les fiches ne sont rendues que le temps de l'impression.
import type { AccesARemettre } from '~~/types'

export interface FicheActivation {
  destinataire: string
  code: string
  expireLe: string
  lien: string
  /** Image du QR du lien (data URL). */
  qr: string
}

export function useImpressionFiches() {
  const fiches = ref<FicheActivation[]>([])
  const toast = useToast()

  /** Imprime une fiche par accès muni d'un lien d'activation. */
  async function imprimer(acces: AccesARemettre[]) {
    try {
      const { toDataURL } = await import('qrcode')
      fiches.value = await Promise.all(acces.filter(a => a.lien).map(async a => ({
        destinataire: a.destinataire, code: a.code, expireLe: a.expireLe, lien: a.lien!,
        qr: await toDataURL(a.lien!, { margin: 1, width: 240, errorCorrectionLevel: 'M' }),
      })))
      if (!fiches.value.length) return
      await nextTick()
      // Certains navigateurs (mobiles) rendent la main avant l'impression : fiches gardées jusqu'à `afterprint`.
      await new Promise<void>((fin) => {
        window.addEventListener('afterprint', () => fin(), { once: true })
        window.print()
      })
    }
    catch {
      toast.erreur('Impression impossible', { message: 'Copiez le message pour le transmettre autrement.' })
    }
    finally {
      fiches.value = []
    }
  }

  return { fiches, imprimer }
}
