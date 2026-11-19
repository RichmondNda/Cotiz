// Exports (rp.export, lot 4.6) : demandés au back, produits par le worker (CSV ou PDF), puis téléchargés par as.file
// (fichier de l'association, conservé 7 jours). L'écran relit l'export jusqu'à ce qu'il soit prêt.
import type { CallOutput } from '@cotiz/api-client'
import { codeErreur } from './client'
import { useLectureFichier } from './fichiers'
import { associationCourante } from './session'

export type TypeExport = CallOutput<'rp.export', 'get'>['kind']

/** Relectures de l'export : rapprochées au début (export léger), puis toutes les 3 s, jusqu'à 2 min. */
const ATTENTES_MS = [500, 1000, 1500, 2000, ...Array.from({ length: 38 }, () => 3000)]

const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/** Refus et échecs, en mots de l'écran. */
export const MESSAGES_EXPORT: Record<string, string> = {
  quota_exceeded: 'Un export est déjà en cours, ou la limite de 20 exports par jour est atteinte. Réessayez plus tard.',
  feature_disabled: 'Les exports ne sont pas inclus dans votre formule.',
  failed: 'L’export n’a pas pu être produit. Réessayez dans quelques minutes.',
  timeout: 'L’export prend plus de temps que prévu. Vous serez notifié dès qu’il sera prêt.',
}

/**
 * Demande un export et le télécharge dès qu'il est prêt (lien `blob:` libéré après 1 min). Lève une erreur dont le
 * message est une clé de `MESSAGES_EXPORT` (refus du back, échec du worker, attente dépassée).
 */
export function useExport() {
  const client = useClient()
  const lire = useLectureFichier()
  return async (kind: TypeExport, options: { nomFichier: string, projectId?: string }) => {
    const aid = await associationCourante(client)
    let job
    try {
      job = await client.call('rp.export', 'create', {
        params: { aid },
        body: { kind, ...(options.projectId ? { projectId: options.projectId } : {}) },
      })
    }
    catch (e) {
      const code = codeErreur(e)
      if (code && code in MESSAGES_EXPORT) throw new Error(code, { cause: e })
      throw e
    }
    for (const attente of ATTENTES_MS) {
      if (job.status === 'done' || job.status === 'failed') break
      await pause(attente)
      job = await client.call('rp.export', 'get', { params: { aid, id: job.id } })
    }
    if (job.status === 'failed') throw new Error('failed')
    if (job.status !== 'done' || !job.fileId) throw new Error('timeout')
    const url = await lire(job.fileId)
    const lien = document.createElement('a')
    lien.href = url
    lien.download = options.nomFichier
    lien.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }
}
