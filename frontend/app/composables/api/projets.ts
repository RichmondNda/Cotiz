// Projets de l'association (pr.*), inscriptions (en.*, mb.lookup), grille (lg.grid), rapport (rp.report), contrat (ct.get),
// relances ponctuelles (rm.send).
import type { Enrollment, Project, ProjectSummary as ProjectSummarySchema } from '@cotiz/contracts'
import type { z } from 'zod'
import type { ApiClient } from './client'
import type {
  ContratProjet, InscriptionCreee, LigneGrilleProjet, ModificationProjet, NouveauProjet, NouvelleInscription, Projet,
  RapportProjet, ResultatRechercheSouscripteur, SouscriptionAvecSouscripteur, SyntheseProjet,
} from '~~/types'
import { DATE_REFERENCE } from '~/utils/date-reference'
import { jourEcheanceDe } from '~/utils/echeancier'
import { formatTelephone } from '~/utils/format'
import { associationCourante, usePermissions } from './session'
import { CALENDRIER_INVERSE, FREQUENCE_INVERSE, MOYEN_INVERSE, STATUT_PROJET_INVERSE, versE164, vueAcces } from './vues/communs'
import { traduireErreur } from './vues/erreurs'
import { apercuDepuis, vueContratProjet, vueGrille, vueProjet, vueRapport, vueSouscription, vueSynthese } from './vues/projets'

type ProjectSummary = z.output<typeof ProjectSummarySchema>

async function inscriptions(client: ApiClient, aid: string, pid: string): Promise<Enrollment[]> {
  return (await toutesLesPages(cursor => client.call('en.list', 'list', { params: { aid, pid }, query: { limit: 100, cursor } }))).items
}

async function contratOuNull(client: ApiClient, aid: string, pid: string) {
  return client.call('ct.get', 'get', { params: { aid, pid } }).catch(() => null)
}

/** Projet de l'interface : moyens de l'association, avatars et contrat (signataire, modèle). */
async function enrichir(client: ApiClient, aid: string, p: ProjectSummary | Project, options: { contrat?: boolean } = {}): Promise<Projet> {
  const [moyens, enr, contrat] = await Promise.all([
    client.call('as.pm.list', 'list', { params: { aid } }),
    inscriptions(client, aid, p.id),
    options.contrat ? contratOuNull(client, aid, p.id) : Promise.resolve(null),
  ])
  return vueProjet(p, { associationId: aid, moyens: moyens.items, apercu: apercuDepuis(enr.filter(e => e.status !== 'withdrawn')), contrat })
}

/**
 * `avecContrat` : fonctionnalité `contracts` active pour la session (lot 4.1) ; sinon `ct.get` n'est pas appelé
 * (build de production avant le lot 4.1 : l'endpoint n'existe pas encore).
 */
export async function chargerProjet(client: ApiClient, aid: string, pid: string, avecContrat: boolean): Promise<Projet> {
  return enrichir(client, aid, await client.call('pr.get', 'get', { params: { aid, pid } }), { contrat: avecContrat })
}

export const useProjets = (filtres: MaybeRefOrGetter<{ associationId?: string, statut?: string }> = {}) =>
  useLecture<Projet[]>(() => `projets:${JSON.stringify(toValue(filtres))}`, async (client) => {
    const aid = toValue(filtres).associationId ?? await associationCourante(client)
    const statut = toValue(filtres).statut
    // Du plus ancien au plus récent, comme la maquette (le contrat renvoie le plus récent d'abord par défaut).
    const { items } = await toutesLesPages(cursor => client.call('pr.list', 'list', {
      params: { aid }, query: { limit: 100, cursor, sort: 'createdAt', status: statut ? STATUT_PROJET_INVERSE[statut as keyof typeof STATUT_PROJET_INVERSE] as 'active' : undefined },
    }))
    return Promise.all(items.map(p => enrichir(client, aid, p)))
  })

/** `immediat: false` : pas d'appel tant que `refresh()` n'est pas demandé (identifiant optionnel). */
export const useProjet = (id: MaybeRefOrGetter<string>, options: { immediat?: boolean } = {}) => {
  const { active } = usePermissions()
  return useLecture<Projet>(
    () => `projet:${toValue(id)}`,
    async client => chargerProjet(client, await associationCourante(client), toValue(id), active('contracts')),
    options,
  )
}

/** Souscripteurs d'un projet (onglet Souscripteurs). */
export const useSouscripteursProjet = (id: MaybeRefOrGetter<string>) =>
  useLecture<SouscriptionAvecSouscripteur[]>(() => `souscripteurs-projet:${toValue(id)}`, async (client) => {
    const aid = await associationCourante(client)
    return (await inscriptions(client, aid, toValue(id))).map(e => vueSouscription(e, aid))
  })

/** Grille d'échéances d'un projet (onglet Paiements). */
export const useGrilleProjet = (id: MaybeRefOrGetter<string>) =>
  useLecture<LigneGrilleProjet[]>(() => `grille-projet:${toValue(id)}`, async (client) => {
    const aid = await associationCourante(client)
    const pid = toValue(id)
    const [grille, enr] = await Promise.all([
      client.call('lg.grid', 'get', { params: { aid, pid }, query: { limit: 100 } }),
      inscriptions(client, aid, pid),
    ])
    return vueGrille(grille, enr.map(e => vueSouscription(e, aid)), pid)
  })

/**
 * Corps de création (MgNouveauProjet) → `CreateProjectInput` ; moyens choisis = moyens de l'association du même type,
 * montants dans la devise de l'association.
 */
async function versProjet(client: ApiClient, aid: string, p: NouveauProjet) {
  const [moyens, { currency }] = await Promise.all([
    client.call('as.pm.list', 'list', { params: { aid } }).then(r => r.items),
    client.call('as.get', 'get', { params: { aid } }),
  ])
  return {
    name: p.nom, description: p.description ?? '', requiredSubscribers: p.souscripteursRequis, graceDays: p.delaiGraceJours,
    entryFee: p.fondsEntree ? { amount: p.fondsEntree, currency } : null,
    installmentAmount: { amount: p.montantEcheance, currency },
    frequency: FREQUENCE_INVERSE[p.frequence], dueDay: jourEcheanceDe(p),
    scheduleType: CALENDRIER_INVERSE[p.typeCalendrier], startDate: p.dateDebut, endDate: p.typeCalendrier === 'dates_fixes' ? p.dateFin ?? null : null,
    paymentMethods: p.modalitesPaiement
      .map(x => moyens.find(pm => pm.isActive && pm.kind === MOYEN_INVERSE[x.moyen]))
      .filter(pm => pm !== undefined)
      .map(pm => ({ paymentMethodId: pm.id, instructionsOverride: p.instructionsPaiement || null })),
    ...(p.contratModele ? { contract: { bodyTemplate: p.contratModele, signerName: p.signataire.nom, signerTitle: p.signataire.fonction, signNow: p.contratSigne } } : {}),
  }
}

/** Création d'un projet (MgNouveauProjet) : brouillon, puis publié (« Inscriptions ouvertes ») sauf brouillon demandé. */
export function useCreationProjet() {
  const client = useClient()
  const { active } = usePermissions()
  return async (projet: NouveauProjet) => {
    const aid = await associationCourante(client)
    try {
      const cree = await client.call('pr.create', 'create', { params: { aid }, body: await versProjet(client, aid, projet) })
      if (!projet.brouillon) await client.call('pr.lifecycle', 'publish', { params: { aid, pid: cree.id } })
      return chargerProjet(client, aid, cree.id, active('contracts'))
    }
    catch (e) {
      traduireErreur(e, { validation_failed: 'projet_incomplet', quota_exceeded: 'quota_exceeded' })
    }
  }
}

/** Vue d'ensemble d'un projet : retardataires, points à traiter, collecte par échéance. */
export const useSyntheseProjet = (id: MaybeRefOrGetter<string>) =>
  useLecture<SyntheseProjet>(() => `synthese-projet:${toValue(id)}`, async (client) => {
    const o = await client.call('pr.overview', 'get', { params: { aid: await associationCourante(client), pid: toValue(id) } })
    return vueSynthese(o, DATE_REFERENCE)
  })

/** Rapports d'un projet : situation par souscripteur, taux cumulé, statuts (graphiques avancés : `<FeatureGate feature="analytics">`). */
export const useRapportProjet = (id: MaybeRefOrGetter<string>) =>
  useLecture<RapportProjet>(() => `rapport-projet:${toValue(id)}`, async (client) => {
    const aid = await associationCourante(client)
    const [r, enr] = await Promise.all([
      client.call('rp.report', 'get', { params: { aid, pid: toValue(id) } }),
      inscriptions(client, aid, toValue(id)),
    ])
    return vueRapport(r, new Set(enr.filter(e => e.status === 'pending_signature').map(e => e.member.id)))
  })

export const useContratProjet = (id: MaybeRefOrGetter<string>) =>
  useLecture<ContratProjet>(() => `contrat-projet:${toValue(id)}`, async (client) => {
    const aid = await associationCourante(client)
    const [c, p, a] = await Promise.all([
      client.call('ct.get', 'get', { params: { aid, pid: toValue(id) } }),
      client.call('pr.get', 'get', { params: { aid, pid: toValue(id) } }),
      client.call('as.get', 'get', { params: { aid } }),
    ])
    return vueContratProjet(c, p, a)
  })

/** Mutations du détail d'un projet (gestionnaire) : à appeler dans `setup`. */
export function useActionsProjet() {
  const client = useClient()
  const { active } = usePermissions()
  return {
    rechercherSouscripteur: async (projetId: string, telephone: string): Promise<ResultatRechercheSouscripteur> => {
      try {
        const r = await client.call('mb.lookup', 'lookup', { params: { aid: await associationCourante(client) }, body: { phone: versE164(telephone), projectId: projetId } })
        if (r.result === 'new') return { cas: 'nouveau' }
        const souscripteur = { id: r.person.id, prenom: r.person.firstName, nom: `${r.person.lastInitial}.`, telephone: formatTelephone(versE164(telephone)), associationIds: [], membreDepuis: '' }
        // Compte existant : prénom et initiale seulement, pas la liste de ses projets (écart R5).
        return r.result === 'already_enrolled' ? { cas: 'deja_inscrit', souscripteur } : { cas: 'compte_existant', souscripteur, nbAssociations: r.associationsCount, projets: [] }
      }
      catch (e) {
        traduireErreur(e, { invalid_phone: 'telephone_invalide', validation_failed: 'telephone_invalide' })
      }
    },
    /** Code à remettre (`acces`) seulement pour un compte créé par l'association et pas encore activé. */
    inscrireSouscripteur: async (projetId: string, i: NouvelleInscription): Promise<InscriptionCreee> => {
      const aid = await associationCourante(client)
      try {
        const r = await client.call('en.create', 'create', {
          params: { aid, pid: projetId },
          body: i.souscripteurId
            ? { userId: i.souscripteurId, ...(i.dateEntree ? { startsFrom: i.dateEntree } : {}) }
            : { phone: versE164(i.telephone), firstName: i.prenom ?? '', lastName: i.nom ?? '', email: i.email || null, address: i.adresse || null, ...(i.dateEntree ? { startsFrom: i.dateEntree } : {}) },
        })
        return { souscription: vueSouscription(r.enrollment, aid), acces: r.handoff ? vueAcces(r.handoff) : null }
      }
      catch (e) {
        traduireErreur(e, { already_enrolled: 'deja_inscrit', validation_failed: 'identite_incomplete', invalid_phone: 'telephone_invalide' })
      }
    },
    /** Retrait : par l'inscription (`Souscription.id`) ; échéances futures annulées, historique conservé. */
    retirerSouscripteur: async (inscriptionId: string, motif?: string) => {
      const aid = await associationCourante(client)
      return client.call('en.withdraw', 'withdraw', { params: { aid, eid: inscriptionId }, body: motif ? { reason: motif } : {} })
    },
    relancer: async (projetId: string, souscripteurIds: string[]) => {
      const r = await client.call('rm.send', 'send', { params: { aid: await associationCourante(client) }, body: { userIds: souscripteurIds, projectId: projetId } })
      return { envoyees: new Set(r.queued.map(q => q.member.id)).size }
    },
    /** `version` : celle du projet affiché (If-Match) ; une modification entre-temps → version_conflict. */
    modifierProjet: async (projetId: string, mod: ModificationProjet, version?: number) => {
      const aid = await associationCourante(client)
      const p = await client.call('pr.get', 'get', { params: { aid, pid: projetId } })
      const moyens = (await client.call('as.pm.list', 'list', { params: { aid } })).items.filter(pm => pm.isActive)
      try {
        await client.call('pr.patch', 'patch', {
          params: { aid, pid: projetId }, ifMatch: version ?? p.version,
          body: {
            ...(mod.nom !== undefined ? { name: mod.nom } : {}),
            ...(mod.description !== undefined ? { description: mod.description } : {}),
            ...(mod.souscripteursRequis !== undefined ? { requiredSubscribers: mod.souscripteursRequis } : {}),
            ...(mod.delaiGraceJours !== undefined ? { graceDays: mod.delaiGraceJours } : {}),
            ...(mod.modalitesPaiement
              ? { paymentMethods: mod.modalitesPaiement.map(x => moyens.find(pm => pm.kind === MOYEN_INVERSE[x.moyen])).filter(pm => pm !== undefined).map(pm => ({ paymentMethodId: pm.id, instructionsOverride: mod.instructionsPaiement || null })) }
              : mod.instructionsPaiement !== undefined ? { paymentMethods: p.paymentMethods.map(x => ({ ...x, instructionsOverride: mod.instructionsPaiement || null })) } : {}),
          },
        })
        return chargerProjet(client, aid, projetId, active('contracts'))
      }
      catch (e) {
        traduireErreur(e, { 'champ:name': 'nom_obligatoire' })
      }
    },
    cloturerProjet: async (projetId: string) => {
      const aid = await associationCourante(client)
      try {
        await client.call('pr.lifecycle', 'close', { params: { aid, pid: projetId } })
        return chargerProjet(client, aid, projetId, active('contracts'))
      }
      catch (e) {
        traduireErreur(e, { invalid_state: 'deja_cloture' })
      }
    },
    supprimerProjet: async (projetId: string, version?: number) => {
      const aid = await associationCourante(client)
      const ifMatch = version ?? (await client.call('pr.get', 'get', { params: { aid, pid: projetId } })).version
      try {
        await client.call('pr.delete', 'remove', { params: { aid, pid: projetId }, ifMatch })
        return { supprime: projetId }
      }
      catch (e) {
        // Projet publié : la suppression est refusée (brouillon seulement), il faut le clôturer.
        traduireErreur(e, { invalid_state: 'pas_brouillon' })
      }
    },
  }
}
