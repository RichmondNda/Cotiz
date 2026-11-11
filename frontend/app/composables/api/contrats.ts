// Contrats : ceux du souscripteur connecté (me.contracts, me.contract, me.sign) et ceux des projets de l'association
// (ct.list, ct.get) ; lot 4.1.
import type { ApiClient } from './client'
import type { ContratDetaille, SyntheseContratProjet } from '~~/types'
import { formatFCFA } from '~/utils/format'
import { associationCourante } from './session'
import { jour } from './vues/communs'
import { contexteSouscripteur, vueProjetRetire } from './vues/souscripteur'
import { monContrat } from './souscripteurs'

/** Contrats du souscripteur connecté, à signer en tête. */
async function mesContrats(client: ApiClient, f: { projetId?: string, statut?: string }): Promise<ContratDetaille[]> {
  const [c, liste] = await Promise.all([contexteSouscripteur(client), client.call('me.contracts', 'list')])
  const contrats = await Promise.all(liste.items
    .filter(x => !f.projetId || x.project.id === f.projetId)
    .map(async (x) => {
      const s = c.souscriptions.find(y => y.projetId === x.project.id)
      const contrat = await monContrat(client, x.project.id, c.moi.id, s?.id ?? x.project.id)
      if (!contrat) return null
      if (s) return { ...contrat, projet: s.projet, souscripteur: c.moi, association: s.association }
      // Inscription retirée (plus dans ses projets) : contrat signé gardé, avec le nom du projet et son association.
      const association = c.associations.get(x.association.id)
      return x.enrollmentWithdrawn && association
        ? { ...contrat, inscriptionRetiree: true, projet: vueProjetRetire(x.project, x.association.id), souscripteur: c.moi, association }
        : null
    }))
  return contrats.filter((x): x is ContratDetaille => x !== null && (!f.statut || x.statut === f.statut))
}

export const useContrats = (filtres: MaybeRefOrGetter<{ projetId?: string, souscripteurId?: string, statut?: string }> = {}) =>
  useLecture<ContratDetaille[]>(() => `contrats:${JSON.stringify(toValue(filtres))}`, client => mesContrats(client, toValue(filtres)))

/** Signature du contrat d'un projet par le souscripteur (empreinte du texte affiché, consentement). */
export function useSignatureContrat() {
  const client = useClient()
  return async (projetId: string): Promise<ContratDetaille> => {
    const affiche = await client.call('me.contract', 'get', { params: { pid: projetId } })
    await client.call('me.sign', 'sign', { params: { pid: projetId }, body: { renderedSha256: affiche.renderedSha256, accepted: true } })
    return (await mesContrats(client, { projetId }))[0]!
  }
}

const UNITES = { weekly: 'par semaine', monthly: 'par mois', quarterly: 'par trimestre', semiannual: 'par semestre', annual: 'par an' } as const
const DUREES = { weekly: 'semaines', monthly: 'mois', quarterly: 'trimestres', semiannual: 'semestres', annual: 'ans' } as const

/** Contrats des projets de l'association du gestionnaire (MgContrats). */
export const useContratsProjets = () =>
  useLecture<SyntheseContratProjet[]>('contrats-projets', async (client) => {
    const aid = await associationCourante(client)
    const liste = await client.call('ct.list', 'list', { params: { aid }, query: { limit: 100 } })
    return Promise.all(liste.items.map(async (x) => {
      const [c, p] = await Promise.all([
        client.call('ct.get', 'get', { params: { aid, pid: x.project.id } }),
        client.call('pr.get', 'get', { params: { aid, pid: x.project.id } }),
      ])
      const n = p.stats.installmentsCount
      const conditions = [
        p.entryFee ? `${formatFCFA(p.entryFee.amount)} à l’entrée, puis` : '',
        `${formatFCFA(p.installmentAmount.amount)} ${UNITES[p.frequency]}`,
        n ? `pendant ${n} ${DUREES[p.frequency]}.` : '.',
        p.stats.totalPerSubscriber ? `Total : ${formatFCFA(p.stats.totalPerSubscriber.amount)}.` : '',
      ].filter(Boolean).join(' ').replace(' .', '.')
      const ouvertes = p.status === 'enrolling'
      return {
        projetId: p.id, nomProjet: p.name, conditions,
        signeParAssociation: { nom: [c.signer.name, c.signer.title].filter(Boolean).join(', '), le: c.associationSignedAt ? jour(c.associationSignedAt) : '[DATE]' },
        signes: x.signed, total: x.total, ...(ouvertes && p.requiredSubscribers ? { places: p.requiredSubscribers } : {}),
        enAttente: ouvertes ? null : x.total - x.signed,
        statut: ouvertes ? 'inscriptions_ouvertes' as const : x.total > x.signed ? 'signatures_en_cours' as const : 'actif' as const,
        nonSignataires: c.unsigned.map(u => ({ souscripteurId: u.member.id, nom: `${u.member.firstName} ${u.member.lastName}`.trim(), inviteLe: jour(u.enrolledAt) })),
      }
    }))
  })
