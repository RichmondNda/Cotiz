// Espace souscripteur : SubscriberProjectCard / SubscriberProjectDetail, Profile du contrat → types d'interface
// (Souscripteur, Projet, SouscriptionMembre, DetailSouscriptionMembre, Association).
import type { PaymentMethod, Profile as ProfileSchema, SubscriberProjectCard, SubscriberProjectDetail as DetailSchema } from '@cotiz/contracts'
import type { z } from 'zod'
import type { ApiClient } from '../client'
import type { Association, Echeance, Projet, Souscripteur, SouscriptionMembre } from '~~/types'
import { endpointDisponible } from '~/utils/bascule'
import { initiales } from '~/utils/format'
import { CALENDRIER, email, FREQUENCE, jour, m, SITUATION, STATUT_PROJET, tel } from './communs'
import { vueModalites } from './associations'
import { vueEcheance } from './paiements'
import { bornesEcheancier } from './projets'

type Profile = z.output<typeof ProfileSchema>
type SubscriberProjectDetail = z.output<typeof DetailSchema>

/** Souscripteur connecté (profil). `associationIds`, `membreDepuis` : associations de `me.assos`. */
export function vueMoi(p: Profile, associations: { id: string, memberSince: string }[]): Souscripteur {
  return {
    id: p.id, prenom: p.firstName, nom: p.lastName, telephone: tel(p.phone), ...(p.email ? { email: email(p.email) } : {}),
    ...(p.address ? { adresse: p.address } : {}), associationIds: associations.map(a => a.id),
    membreDepuis: associations.map(a => jour(a.memberSince)).sort()[0] ?? '[DATE]',
  }
}

/** Projet vu par le souscripteur : conditions et moyens de paiement (pas d'indicateurs de l'association). */
export function vueProjetSouscripteur(d: SubscriberProjectDetail): Projet {
  const t = d.terms
  const { premiere, derniere } = bornesEcheancier(t)
  const periodiques = d.installments.filter(i => i.kind === 'periodic').length
  return {
    id: d.project.id, associationId: d.association.id, nom: d.project.name, statut: STATUT_PROJET[d.project.status]!,
    fondsEntree: t.entryFee ? m(t.entryFee) : null, montantEcheance: m(t.installmentAmount), frequence: FREQUENCE[t.frequency]!,
    jourEcheance: t.dueDay, typeCalendrier: CALENDRIER[t.scheduleType]!, dateDebut: premiere, ...(derniere ? { dateFin: derniere } : {}),
    ...(t.scheduleType === 'fixed' && periodiques ? { nbEcheances: periodiques } : {}), delaiGraceJours: 5, souscripteursRequis: null,
    modalitesPaiement: vueModalites(d.paymentMethods), instructionsPaiement: d.paymentMethods.find(x => x.instructions)?.instructions ?? undefined,
    contratModele: '', nbSouscripteurs: '[N]', montantCollecte: '[MONTANT]', montantAttenduADate: '[MONTANT]', tauxRecouvrement: '[N]',
    avancement: '[N]', nbEnRetard: 0, nbSignaturesAttendues: 0, nbPaiementsAValider: 0,
    ...(d.nextDue ? { prochaineEcheance: d.nextDue.dueDate } : {}), ...(d.commitment ? { engagementParSouscripteur: m(d.commitment) } : {}),
  }
}

/** Association vue par le souscripteur (cartes, « Comment payer »). */
export function vueAssociationMembre(a: { id: string, name: string, city?: string, country?: string, description?: string | null, contactEmail?: string, contactPhone?: string }, moyens: PaymentMethod[] = []): Association {
  return {
    id: a.id, nom: a.name, sigle: initiales(a.name), ville: a.city ?? '', pays: a.country ?? 'Côte d’Ivoire', description: a.description ?? undefined,
    ...(a.contactPhone ? { telephoneContact: tel(a.contactPhone) } : {}), ...(a.contactEmail ? { emailContact: email(a.contactEmail) } : {}),
    statut: 'active', planId: '', modalitesPaiement: vueModalites(moyens), nbProjets: 0, nbSouscripteurs: 0, nbGestionnaires: 0, creeeLe: '[DATE]',
  }
}

/** Souscription du souscripteur : projet, association, situation (retards, prochaine échéance). */
export function vueSouscriptionMembre(c: SubscriberProjectCard, d: SubscriberProjectDetail, moi: Souscripteur, association: Association): SouscriptionMembre {
  return {
    id: c.enrollmentId, souscripteurId: moi.id, projetId: c.project.id, inscritLe: '[DATE]',
    ...(d.contract.signedAt ? { contratSigneLe: jour(d.contract.signedAt), contratId: c.enrollmentId } : d.contract.required ? { contratId: c.enrollmentId } : {}),
    verse: m(c.paid), reste: m(c.remaining), engagement: c.commitment ? m(c.commitment) : m(c.paid) + m(c.remaining),
    statut: SITUATION[c.standing]!, montantEnRetard: c.late ? m(c.late.amount) : 0,
    projet: vueProjetSouscripteur(d), association,
    nbEcheancesEnRetard: c.late?.count ?? 0,
    ...(c.late ? { retardDepuis: c.late.since } : {}),
    ...(c.nextDue ? { prochaine: { date: c.nextDue.dueDate, montant: m(c.nextDue.amount) } } : {}),
  }
}

export interface ContexteSouscripteur {
  moi: Souscripteur
  details: SubscriberProjectDetail[]
  souscriptions: SouscriptionMembre[]
  projets: Map<string, Projet>
  echeances: Map<string, Echeance>
  associations: Map<string, Association>
}

/**
 * Profil, projets (cartes + détail de chacun) et associations du souscripteur connecté. Sans `me.assos` (lot 4.5, pas
 * encore livré dans un build sans mocks) : associations tirées des cartes de projet, avec les moyens de paiement retenus
 * par leurs projets (`me.project`).
 */
export async function contexteSouscripteur(client: ApiClient): Promise<ContexteSouscripteur> {
  const avecFiches = endpointDisponible('me.assos', 'subscriber')
  const [profil, projets, assos] = await Promise.all([
    client.call('me.profile', 'get'), client.call('me.projects', 'list'),
    avecFiches ? client.call('me.assos', 'list') : Promise.resolve(null),
  ])
  const moi = assos
    ? vueMoi(profil, assos.items.map(a => ({ id: a.association.id, memberSince: a.memberSince })))
    : { ...vueMoi(profil, []), associationIds: [...new Set(projets.items.map(c => c.association.id))] }
  const details = await Promise.all(projets.items.map(c => client.call('me.project', 'get', { params: { pid: c.project.id } })))
  const fiches = assos ? await Promise.all(assos.items.map(a => client.call('me.assos', 'get', { params: { aid: a.association.id } }))) : []
  const associations = new Map(fiches.map(f => [f.association.id, vueAssociationMembre(f.association, f.paymentMethods)]))
  projets.items.forEach((c, i) => {
    if (!associations.has(c.association.id)) associations.set(c.association.id, vueAssociationMembre(c.association, assos ? [] : details[i]!.paymentMethods))
  })
  const souscriptions = projets.items.map((c, i) => vueSouscriptionMembre(c, details[i]!, moi, associations.get(c.association.id)!))
  return {
    moi, details, souscriptions,
    projets: new Map(souscriptions.map(s => [s.projetId, s.projet])),
    echeances: new Map(details.flatMap(d => d.installments.map(i => [i.id, vueEcheance(i, moi.id)] as const))),
    associations,
  }
}
