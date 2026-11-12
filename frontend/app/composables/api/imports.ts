// Import de souscripteurs (MgImport, lot 4.4) : dépôt du fichier (fl.upload, usage import_source), création (im.flow),
// lecture de l'import et de ses lignes (im.read), correspondance des colonnes et correction d'une ligne (im.steps),
// envoi (im.commit). L'analyse, le classement et l'envoi tournent dans le worker : l'écran relit l'import toutes les 2 s.
import type { CallOutput } from '@cotiz/api-client'
import type { AnalyseImport, LigneImport } from '~~/types'
import { toutesLesPages } from './client'
import { associationCourante } from './session'
import { traduireErreur } from './vues/erreurs'

type Job = CallOutput<'im.read', 'get'>
type Row = CallOutput<'im.read', 'rows'>['items'][number]
type Field = 'firstName' | 'lastName' | 'phone' | 'email' | 'address'
type Champ = NonNullable<AnalyseImport['colonnes'][number]['champ']>

const MIME: Record<string, string> = { csv: 'text/csv', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
const CHAMP: Record<Field, Champ> = { firstName: 'prenom', lastName: 'nom', phone: 'telephone', email: 'email', address: 'adresse' }
const FIELD = Object.fromEntries(Object.entries(CHAMP).map(([f, c]) => [c, f])) as Record<Champ, Field>
const ETAT: Record<Job['status'], AnalyseImport['etat']> = {
  uploaded: 'analyse', mapped: 'colonnes', validated: 'pret', importing: 'envoi', completed: 'termine', failed: 'echec',
}
const ECHEC: Record<NonNullable<Job['failure']>, string> = {
  file_rejected: 'Le fichier a été refusé par l’analyse de sécurité.',
  unreadable: 'Fichier illisible : utilisez un fichier .xlsx ou .csv avec une ligne par souscripteur.',
  empty: 'Le fichier ne contient aucune ligne de souscripteur.',
  too_many_rows: 'Le fichier dépasse 5 000 lignes : découpez-le en plusieurs fichiers.',
  requester_removed: 'L’envoi a été arrêté : vous ne gérez plus cette association.',
  internal: 'L’import s’est interrompu. Les souscripteurs déjà inscrits le restent ; réessayez avec un nouveau fichier.',
}
const NOM_CHAMP: Record<Field, string> = { firstName: 'Prénom', lastName: 'Nom', phone: 'Téléphone', email: 'Email', address: 'Adresse' }
const MOTIF: Record<string, string> = {
  invalid_phone: 'Téléphone incomplet',
  account_closed: 'Compte fermé : autre numéro à saisir',
  invalid_email: 'Email invalide',
  already_enrolled: 'Déjà inscrit au projet',
  quota_exceeded: 'Plus de place dans l’abonnement',
}

/** Problème d'une ligne en erreur, en clair (premier motif). */
function motifDe(e: Row['errors'][number]): string {
  if (e.code === 'required' && e.field) return `${NOM_CHAMP[e.field]} manquant`
  if (e.code === 'too_long' && e.field) return `${NOM_CHAMP[e.field]} trop long`
  return MOTIF[e.code] ?? 'Inscription refusée'
}

function vueLigne(r: Row): LigneImport {
  const v = r.values
  const base = {
    id: r.id, ligne: r.rowNumber, prenom: v.firstName ?? '', nom: v.lastName ?? '', telephone: v.phone ?? '',
    ...(v.email ? { email: v.email } : {}), ...(v.address ? { adresse: v.address } : {}),
  }
  switch (r.category) {
    case 'ready': return { ...base, statut: 'prete' }
    case 'existing': return { ...base, statut: 'compte_existant' }
    case 'ignored': return { ...base, statut: 'ignoree' }
    case 'duplicate': return { ...base, statut: 'doublon', ...(r.duplicateOf ? { doublonDe: r.duplicateOf } : {}) }
    default: {
      const premier = r.errors[0]
      const motif = premier ? motifDe(premier) : 'Inscription refusée'
      const prenom = premier?.field === 'firstName' && premier.code === 'required'
      const statut = premier?.field === 'phone' ? 'telephone_incomplet' : prenom ? 'prenom_manquant' : 'erreur'
      return { ...base, statut, motif }
    }
  }
}

function vueImport(j: Job, fichier: string): AnalyseImport {
  const c = j.counts
  return {
    id: j.id,
    fichier,
    etat: ETAT[j.status],
    echec: j.failure ? ECHEC[j.failure] : null,
    nbLignes: c.ready + c.existing + c.error + c.duplicate + c.ignored,
    colonnes: j.columns.map(col => ({ colonne: col.name, exemples: col.samples, champ: col.field ? CHAMP[col.field] : null })),
    compteurs: { pretes: c.ready, comptesExistants: c.existing, erreurs: c.error, doublons: c.duplicate, ignorees: c.ignored },
    progression: j.progress
      ? { total: j.progress.total, traitees: j.progress.processed, inscrits: j.progress.enrolled, rattaches: j.progress.attached, echecs: j.progress.failed }
      : null,
    creeLe: j.createdAt,
  }
}

const pause = (ms: number) => new Promise(fin => setTimeout(fin, ms))

/** Actions de l'import d'un projet : à appeler dans `setup`. */
export function useActionsImport() {
  const client = useClient()
  const fichiers = new Map<string, string>()
  const lire = async (id: string) => {
    const job = await client.call('im.read', 'get', { params: { aid: await associationCourante(client), id } })
    return vueImport(job, fichiers.get(id) ?? '')
  }

  return {
    /** Dépôt du fichier (contenu envoyé au stockage) puis création de l'import ; l'analyse suit dans le worker. */
    deposer: async (projetId: string, fichier: File): Promise<AnalyseImport> => {
      const aid = await associationCourante(client)
      const ext = fichier.name.split('.').pop()?.toLowerCase() ?? ''
      try {
        const mimeType = MIME[ext] ?? fichier.type
        const ticket = await client.call('fl.upload', 'create', { body: { purpose: 'import_source', fileName: fichier.name, mimeType, sizeBytes: fichier.size } })
        await $fetch(ticket.uploadUrl, { method: ticket.method, headers: ticket.headers, body: fichier })
        await client.call('fl.upload', 'complete', { params: { id: ticket.fileId } })
        const job = await client.call('im.flow', 'create', { params: { aid, pid: projetId }, body: { fileId: ticket.fileId } })
        fichiers.set(job.id, fichier.name)
        return vueImport(job, fichier.name)
      }
      catch (e) {
        traduireErreur(e, { file_type_not_allowed: 'fichier_invalide', file_too_large: 'fichier_invalide' })
      }
    },
    lire,
    /**
     * Relit l'import toutes les 2 s jusqu'à ce que `fini` le dise, ou que `actif` devienne faux (page quittée) ;
     * `suivre` reçoit chaque lecture (progression de l'envoi).
     */
    attendre: async (
      id: string,
      fini: (a: AnalyseImport) => boolean,
      options: { suivre?: (a: AnalyseImport) => void, actif?: () => boolean } = {},
    ): Promise<AnalyseImport> => {
      for (;;) {
        const a = await lire(id)
        options.suivre?.(a)
        if (fini(a) || options.actif?.() === false) return a
        await pause(2000)
      }
    },
    /** Toutes les lignes, dans l'ordre du fichier. */
    lignes: async (id: string): Promise<LigneImport[]> => {
      const aid = await associationCourante(client)
      const { items } = await toutesLesPages(cursor => client.call('im.read', 'rows', { params: { aid, id }, query: { limit: 100, cursor } }))
      return items.map(vueLigne)
    },
    /** Correspondance des colonnes envoyée ; le worker reclasse les lignes. */
    colonnes: async (id: string, colonnes: { colonne: string, champ: Champ | null }[]) => {
      const mapping = Object.fromEntries(colonnes.map(c => [c.colonne, c.champ ? FIELD[c.champ] : null]))
      const job = await client.call('im.steps', 'mapping', { params: { aid: await associationCourante(client), id }, body: { mapping } })
      return vueImport(job, fichiers.get(id) ?? '')
    },
    /** Ligne corrigée (valeurs saisies) ou ignorée ; elle revient contrôlée par le serveur. */
    corriger: async (id: string, ligne: LigneImport, changement: { valeurs?: Partial<Record<Champ, string>>, ignorer?: boolean }) => {
      const values = Object.fromEntries(Object.entries(changement.valeurs ?? {}).map(([c, v]) => [FIELD[c as Champ], v]))
      const body = { ...(changement.valeurs ? { values } : {}), ...(changement.ignorer === undefined ? {} : { ignore: changement.ignorer }) }
      const row = await client.call('im.steps', 'row', { params: { aid: await associationCourante(client), id, rowId: ligne.id }, body })
      return vueLigne(row)
    },
    /** Envoi : les lignes prêtes et les comptes existants sont inscrits par le worker. */
    lancer: async (id: string): Promise<AnalyseImport> => {
      try {
        const job = await client.call('im.commit', 'commit', { params: { aid: await associationCourante(client), id } })
        return vueImport(job, fichiers.get(id) ?? '')
      }
      catch (e) {
        traduireErreur(e, { invalid_state: 'rien_a_importer', quota_exceeded: 'quota_atteint' })
      }
    },
  }
}
