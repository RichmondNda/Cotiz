// Souscripteurs : annuaire et fiche gestionnaire (mb.*), espace du souscripteur connecté (me.*).
import type { ApiClient } from './client'
import type {
  AssociationMembre, Contrat, DetailSouscriptionMembre, FicheSouscripteur, ModificationSouscripteur, Souscripteur, SouscripteurAnnuaire,
  SouscriptionMembre,
} from '~~/types'
import { associationCourante } from './session'
import { email, jour, local, m, SITUATION, tel } from './vues/communs'
import { traduireErreur } from './vues/erreurs'
import { vueEcheance, vuePaiement } from './vues/paiements'
import { vueProjet, vueSouscription } from './vues/projets'
import { contexteSouscripteur } from './vues/souscripteur'

// ---------------------------------------------------------------- Espace gestionnaire

/** Annuaire des souscripteurs de l'association. */
export const useSouscripteurs = (filtres: MaybeRefOrGetter<{ associationId?: string }> = {}) =>
  useLecture<SouscripteurAnnuaire[]>(() => `souscripteurs:${JSON.stringify(toValue(filtres))}`, async (client) => {
    const aid = toValue(filtres).associationId ?? await associationCourante(client)
    const { items } = await toutesLesPages(cursor => client.call('mb.list', 'list', { params: { aid }, query: { limit: 100, cursor } }))
    return items.map(x => ({
      id: x.member.id, prenom: x.member.firstName, nom: x.member.lastName, telephone: tel(x.member.phone), email: email(x.member.email),
      associationIds: [aid], membreDepuis: '[DATE]', projetIds: x.projects.map(p => p.id),
      totalVerse: m(x.totalPaid), totalReste: m(x.totalRemaining), statutGlobal: SITUATION[x.standing]!,
    }))
  })

const TONS = { success: 'success', danger: 'danger', warning: 'warning', info: 'info', brand: 'brand', neutral: 'info' } as const

async function fiche(client: ApiClient, aid: string, uid: string): Promise<FicheSouscripteur> {
  const [d, frise, projets] = await Promise.all([
    client.call('mb.get', 'get', { params: { aid, uid } }),
    toutesLesPages(cursor => client.call('mb.timeline', 'list', { params: { aid, uid }, query: { limit: 100, cursor } })),
    toutesLesPages(cursor => client.call('pr.list', 'list', { params: { aid }, query: { limit: 100, cursor } })),
  ])
  const vues = new Map(projets.items.map(p => [p.id, vueProjet(p, { associationId: aid })]))
  return {
    souscripteur: {
      id: d.member.id, prenom: d.member.firstName, nom: d.member.lastName, telephone: tel(d.member.phone), email: email(d.member.email),
      ...(d.member.address ? { adresse: d.member.address } : {}), associationIds: [aid], membreDepuis: jour(d.memberSince),
    },
    souscriptions: d.enrollments.map((e) => {
      const { souscripteur: _s, ...souscription } = vueSouscription(e, aid)
      return { ...souscription, projet: vues.get(e.project.id)!, echeances: e.installments.map(i => vueEcheance(i, d.member.id)) }
    }),
    statutGlobal: SITUATION[d.standing]!,
    membreDepuis: jour(d.memberSince),
    historique: frise.items.map(ev => ({ id: ev.id, date: local(ev.at), titre: ev.title, ...(ev.detail ? { detail: ev.detail } : {}), ton: TONS[ev.tone] })),
  }
}

export const useSouscripteur = (id: MaybeRefOrGetter<string>) =>
  useLecture<FicheSouscripteur>(() => `souscripteur:${toValue(id)}`, async client => fiche(client, await associationCourante(client), toValue(id)))

/** Actions du gestionnaire sur la fiche d'un souscripteur. */
export function useActionsSouscripteur() {
  const client = useClient()
  return {
    modifier: async (id: string, mod: ModificationSouscripteur) => {
      const aid = await associationCourante(client)
      const d = await client.call('mb.get', 'get', { params: { aid, uid: id } })
      try {
        await client.call('mb.patch', 'patch', {
          params: { aid, uid: id }, ifMatch: d.version,
          body: { ...(mod.email !== undefined ? { email: mod.email || null } : {}), ...(mod.adresse !== undefined ? { address: mod.adresse || null } : {}) },
        })
        return fiche(client, aid, id)
      }
      catch (e) {
        traduireErreur(e, { 'champ:email': 'email-invalide', 'validation_failed': 'email-invalide' })
      }
    },
    /**
     * « Renvoyer les identifiants » : nouveau code d'activation pour un compte non activé (mb.resend) ; rien n'est envoyé
     * (sans fournisseur). La carte « Code d'activation » avec message prêt arrive au lot 2.3.
     */
    renvoyerIdentifiants: async (id: string) => {
      const aid = await associationCourante(client)
      const d = await client.call('mb.get', 'get', { params: { aid, uid: id } })
      if (d.member.accountStatus === 'pending_activation') await client.call('mb.resend', 'regenerate', { params: { aid, uid: id } })
      return { envoye: true, canal: 'sms' as const, telephone: tel(d.member.phone) }
    },
  }
}

// ---------------------------------------------------------------- Espace souscripteur (utilisateur connecté)

/** Fiche du souscripteur connecté (profil). */
export const useMonProfil = () =>
  useLecture<Souscripteur>('moi-profil', async client => (await contexteSouscripteur(client)).moi)

/** Projets du souscripteur connecté (accueil, déclaration), avec retards et prochaine échéance. */
export const useMesSouscriptions = () =>
  useLecture<SouscriptionMembre[]>('mes-souscriptions', async client => (await contexteSouscripteur(client)).souscriptions)

/** Contrat d'un projet vu par le souscripteur (texte personnalisé, signatures). */
export async function monContrat(client: ApiClient, pid: string, souscripteurId: string, enrollmentId: string): Promise<Contrat | undefined> {
  const c = await client.call('me.contract', 'get', { params: { pid } }).catch(() => null)
  if (!c) return undefined
  return {
    id: enrollmentId, projetId: pid, souscripteurId, associationId: c.association.id, texte: c.body,
    engagement: c.commitment.total ? m(c.commitment.total) : 0, statut: c.signedAt ? 'signe' : 'a_signer', envoyeLe: '[DATE]',
    ...(c.signedAt ? { signeLe: local(c.signedAt) } : {}),
    ...(c.associationSigner.signedAt ? { signeParAssociationLe: jour(c.associationSigner.signedAt) } : {}),
    signataireAssociation: [c.associationSigner.name, c.associationSigner.title].filter(Boolean).join(', '),
  }
}

/** Détail d'un projet du souscripteur connecté : échéancier, paiements déclarés, contrat. */
export const useMaSouscription = (projetId: MaybeRefOrGetter<string>) =>
  useLecture<DetailSouscriptionMembre>(() => `ma-souscription:${toValue(projetId)}`, async (client) => {
    const c = await contexteSouscripteur(client)
    const pid = toValue(projetId)
    const s = c.souscriptions.find(x => x.projetId === pid)
    const d = c.details.find(x => x.project.id === pid)
    if (!s || !d) throw createError({ statusCode: 404, statusMessage: 'Projet introuvable' })
    const contrat = d.contract.required ? await monContrat(client, pid, c.moi.id, s.id) : undefined
    return {
      ...s,
      echeances: d.installments.map(i => vueEcheance(i, c.moi.id)),
      paiements: d.payments.map(p => vuePaiement(p, { souscripteurId: c.moi.id, projetId: pid, associationId: p.association.id, rejet: p.rejection })),
      ...(contrat ? { contrat } : {}),
    }
  })

/** Associations du souscripteur connecté et ses projets dans chacune. */
async function mesAssociations(client: ApiClient): Promise<AssociationMembre[]> {
  const [c, assos] = await Promise.all([contexteSouscripteur(client), client.call('me.assos', 'list')])
  return assos.items.map(a => ({
    association: c.associations.get(a.association.id)!,
    membreDepuis: jour(a.memberSince),
    souscriptions: c.souscriptions.filter(s => s.association.id === a.association.id),
  }))
}

export const useMesAssociations = () => useLecture<AssociationMembre[]>('mes-associations', mesAssociations)

export const useMonAssociation = (id: MaybeRefOrGetter<string>) =>
  useLecture<AssociationMembre>(() => `mon-association:${toValue(id)}`, async (client) => {
    const a = (await mesAssociations(client)).find(x => x.association.id === toValue(id))
    if (!a) throw createError({ statusCode: 404, statusMessage: 'Association introuvable' })
    return a
  })

/** Modification de son email par le souscripteur (le téléphone n'est modifiable que par l'association). */
export function useModificationMonProfil() {
  const client = useClient()
  return async (mod: { email?: string }) => {
    try {
      await client.call('me.profile', 'patch', { body: { email: mod.email || null } })
      return (await contexteSouscripteur(client)).moi
    }
    catch (e) {
      traduireErreur(e, { 'champ:email': 'email-invalide', 'validation_failed': 'email-invalide' })
    }
  }
}
