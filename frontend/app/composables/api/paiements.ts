// Paiements : file et détail gestionnaire (lg.pay.*), historique et confirmation souscripteur (me.history, me.payment),
// échéances (me.project / lg.grid). Le rôle de la session choisit l'espace interrogé.
import type { ApiClient } from './client'
import type { Echeance, EtatPaiement, NouvelleDeclaration, Paiement, PaiementDetail, PaiementListe, Projet, RejetPaiement, Souscripteur, ValidationPaiement } from '~~/types'
import { useSession } from '~/composables/useSession'
import { associationCourante } from './session'
import { chargerAssociation } from './associations'
import { MOTIF_REJET_INVERSE, MOYEN_INVERSE, STATUT_PAIEMENT_INVERSE } from './vues/communs'
import { traduireErreur } from './vues/erreurs'
import { vueEcheance, vuePaiementDetail, vuePaiementListe, vuePaiementSouscripteur } from './vues/paiements'
import { contexteSouscripteur } from './vues/souscripteur'
import { vueGrille, vueProjet, vueSouscription } from './vues/projets'

type FiltresPaiements = { statut?: string, souscripteurId?: string, projetId?: string, associationId?: string }

/** Projets, souscripteurs et échéances de l'association, pour reconstruire les lignes de paiement. */
async function contexteAssociation(client: ApiClient, aid: string, seulement?: string[]) {
  const projets = (await toutesLesPages(cursor => client.call('pr.list', 'list', { params: { aid }, query: { limit: 100, cursor } }))).items
    .filter(p => !seulement || seulement.includes(p.id))
  const vues = new Map<string, Projet>(projets.map(p => [p.id, vueProjet(p, { associationId: aid })]))
  const souscripteurs = new Map<string, Souscripteur>()
  const echeances = new Map<string, Echeance>()
  await Promise.all(projets.map(async (p) => {
    const [grille, enr] = await Promise.all([
      client.call('lg.grid', 'get', { params: { aid, pid: p.id }, query: { limit: 100 } }),
      toutesLesPages(cursor => client.call('en.list', 'list', { params: { aid, pid: p.id }, query: { limit: 100, cursor } })),
    ])
    const souscriptions = enr.items.map(e => vueSouscription(e, aid))
    for (const s of souscriptions) souscripteurs.set(s.souscripteurId, s.souscripteur)
    for (const ligne of vueGrille(grille, souscriptions, p.id)) for (const e of ligne.echeances) echeances.set(e.id, e)
  }))
  return { projets: vues, souscripteurs, echeances, associationId: aid }
}

export const usePaiements = (filtres: MaybeRefOrGetter<FiltresPaiements> = {}) => {
  const { role } = useSession()
  return useLecture<PaiementListe[]>(() => `paiements:${role.value}:${JSON.stringify(toValue(filtres))}`, async (client) => {
    const f = toValue(filtres)
    if (role.value === 'souscripteur') {
      const c = await contexteSouscripteur(client)
      const { items } = await toutesLesPages(cursor => client.call('me.history', 'list', { query: { limit: 100, cursor, projectId: f.projetId } }))
      return items
        .filter(p => !f.statut || p.status === STATUT_PAIEMENT_INVERSE[f.statut as keyof typeof STATUT_PAIEMENT_INVERSE])
        .map(p => vuePaiementSouscripteur(p, c))
    }
    const aid = f.associationId ?? await associationCourante(client)
    const status = f.statut ? STATUT_PAIEMENT_INVERSE[f.statut as keyof typeof STATUT_PAIEMENT_INVERSE] as 'pending' : 'all'
    const { items } = await toutesLesPages(cursor => client.call('lg.pay.list', 'list', {
      params: { aid }, query: { limit: 100, cursor, status, projectId: f.projetId, userId: f.souscripteurId },
    }))
    const c = await contexteAssociation(client, aid, [...new Set(items.map(p => p.project.id))])
    return items.map(p => vuePaiementListe(p, c))
  })
}

export const usePaiement = (id: MaybeRefOrGetter<string>) => {
  const { role } = useSession()
  return useLecture<PaiementDetail>(() => `paiement:${role.value}:${toValue(id)}`, async (client) => {
    if (role.value === 'souscripteur') {
      const [c, p] = await Promise.all([contexteSouscripteur(client), client.call('me.payment', 'get', { params: { id: toValue(id) } })])
      const liste = vuePaiementSouscripteur(p, c)
      const echeancier = c.details.find(d => d.project.id === p.project.id)?.installments.map(i => vueEcheance(i, c.moi.id)) ?? []
      return { ...liste, ...(p.comment ? { commentaire: p.comment } : {}), echeances: liste.echeancesCouvertes, association: c.associations.get(p.association.id)!, echeancier, derniersVersements: [] }
    }
    const aid = await associationCourante(client)
    const p = await client.call('lg.pay.get', 'get', { params: { aid, payId: toValue(id) } })
    const [c, association] = await Promise.all([contexteAssociation(client, aid, [p.project.id]), chargerAssociation(client, aid)])
    return vuePaiementDetail(p, { ...c, association })
  })
}

/** Échéances du souscripteur connecté (déclaration, historique). */
export const useEcheances = (filtres: MaybeRefOrGetter<{ projetId?: string, souscripteurId?: string, statut?: string }> = {}) =>
  useLecture<Echeance[]>(() => `echeances:${JSON.stringify(toValue(filtres))}`, async (client) => {
    const c = await contexteSouscripteur(client)
    const f = toValue(filtres)
    return [...c.echeances.values()].filter(e => (!f.projetId || e.projetId === f.projetId) && (!f.statut || e.statut === f.statut))
  })

/**
 * Version (If-Match) et devise d'une décision : celles du paiement affiché (détail) — une modification entre-temps
 * renvoie `version_conflict`. Écrans de liste (le résumé du contrat n'a pas de `version`) : relues juste avant l'envoi.
 */
async function etatPaiement(client: ApiClient, aid: string, payId: string, connu?: EtatPaiement): Promise<EtatPaiement> {
  if (connu) return connu
  const p = await client.call('lg.pay.get', 'get', { params: { aid, payId } })
  return { version: p.version, devise: p.amountDeclared.currency }
}

/** Validation d'un paiement déclaré par un gestionnaire (grille, file de validation, détail), répartition ajustable. */
export function useValidationPaiement() {
  const client = useClient()
  return async (paiementId: string, corps: ValidationPaiement = {}): Promise<Paiement> => {
    const aid = await associationCourante(client)
    try {
      const { version, devise } = await etatPaiement(client, aid, paiementId, corps.etat)
      await client.call('lg.pay.validate', 'validate', {
        params: { aid, payId: paiementId }, ifMatch: version,
        body: {
          ...(corps.repartition ? { allocations: corps.repartition.map(r => ({ installmentId: r.echeanceId, amount: { amount: r.montantAffecte, currency: devise } })) } : {}),
          ...(corps.montantRecu !== undefined ? { amountReceived: { amount: corps.montantRecu, currency: devise } } : {}),
        },
      })
      return detailPaiement(client, aid, paiementId)
    }
    catch (e) {
      traduireErreur(e, { payment_already_reviewed: 'deja_traite' })
    }
  }
}

async function detailPaiement(client: ApiClient, aid: string, payId: string): Promise<Paiement> {
  const p = await client.call('lg.pay.get', 'get', { params: { aid, payId } })
  const c = await contexteAssociation(client, aid, [p.project.id])
  return vuePaiementDetail(p, { ...c, association: await chargerAssociation(client, aid) })
}

/** Traitement d'un paiement par le gestionnaire : valider, rejeter (motif obligatoire), annuler la dernière validation. */
export function useTraitementPaiement() {
  const client = useClient()
  return {
    valider: useValidationPaiement(),
    rejeter: async (paiementId: string, corps: RejetPaiement): Promise<Paiement> => {
      const aid = await associationCourante(client)
      try {
        await client.call('lg.pay.reject', 'reject', {
          params: { aid, payId: paiementId }, ifMatch: (await etatPaiement(client, aid, paiementId, corps.etat)).version,
          body: { reasonCode: MOTIF_REJET_INVERSE[corps.motif], ...(corps.message ? { message: corps.message } : {}) },
        })
        return detailPaiement(client, aid, paiementId)
      }
      catch (e) {
        traduireErreur(e, { payment_already_reviewed: 'deja_traite', validation_failed: 'motif_requis' })
      }
    },
    /** Seule une validation s'annule (opération compensatoire) ; un rejet est définitif (écart R6). */
    annuler: async (paiementId: string): Promise<Paiement> => {
      const aid = await associationCourante(client)
      try {
        await client.call('lg.pay.revert', 'revert', { params: { aid, payId: paiementId } })
        return detailPaiement(client, aid, paiementId)
      }
      catch (e) {
        traduireErreur(e, { invalid_state: 'rien_a_annuler', revert_window_expired: 'rien_a_annuler', not_reviewer: 'rien_a_annuler' })
      }
    },
  }
}

const MIME_PREUVE = (nom: string) => (nom.toLowerCase().endsWith('.pdf') ? 'application/pdf' : nom.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg')

/**
 * Déclaration d'un paiement par le souscripteur (MbDeclarer) : dépôt de la preuve (fl.upload), puis me.declare avec la
 * répartition choisie et le moyen de paiement de l'association du même type.
 */
export function useDeclarationPaiement() {
  const client = useClient()
  /** `cle` : clé d'idempotence, identique pour chaque nouvel essai du même contenu (useDeclaration › cleEnvoi). */
  return async (d: NouvelleDeclaration, cle: string): Promise<{ id: string }> => {
    const projet = await client.call('me.project', 'get', { params: { pid: d.projetId } })
    const devise = projet.remaining.currency
    const moyen = projet.paymentMethods.find(pm => pm.kind === MOYEN_INVERSE[d.moyen]) ?? null
    let proofFileId: string | undefined
    if (d.preuve.type !== 'reference') {
      const ticket = await client.call('fl.upload', 'create', { body: { purpose: 'payment_proof', fileName: d.preuve.nomFichier, mimeType: MIME_PREUVE(d.preuve.nomFichier), sizeBytes: 1 } })
      await $fetch(ticket.uploadUrl, { method: 'PUT', headers: ticket.headers, body: '' })
      await client.call('fl.upload', 'complete', { params: { id: ticket.fileId } })
      proofFileId = ticket.fileId
    }
    const reference = d.preuve.reference?.trim()
    try {
      return await client.call('me.declare', 'declare', { idempotencyKey: cle, body: {
        projectId: d.projetId, amount: { amount: d.montant, currency: devise }, paidOn: d.dateVirement, paymentMethodId: moyen?.id ?? null,
        ...(proofFileId ? { proofFileId } : {}), ...(reference ? { transactionReference: reference } : {}),
        ...(d.commentaire ? { comment: d.commentaire } : {}),
        allocations: d.repartition.map(r => ({ installmentId: r.echeanceId, amount: { amount: r.montantAffecte, currency: devise } })),
      } })
    }
    catch (e) {
      traduireErreur(e, {
        signature_required: 'contrat-a-signer', amount_exceeds_remaining: 'montant-trop-eleve', allocation_mismatch: 'repartition-invalide',
        allocation_exceeds_remaining: 'repartition-invalide', installment_not_open: 'repartition-invalide', proof_required: 'preuve-manquante', validation_failed: 'montant-invalide',
      })
    }
  }
}
