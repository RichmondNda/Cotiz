// Demandes de création : AssociationRequestSummary / Detail du contrat → `Demande` / `DemandeDetaillee` de l'interface.
import type { CallOutput } from '@cotiz/api-client'
import type { AssociationRequestDetail } from '@cotiz/contracts'
import type { Demande, DemandeDetaillee, EvenementDemande, NouvelleDemande, TypeAssociation } from '~~/types'
import { email, jour, local, STATUT_DEMANDE, tel, trancheProjets, TRANCHES_PROJETS, TRANCHES_SOUSCRIPTEURS, versE164 } from './communs'

type Resume = CallOutput<'pf.req.list', 'list'>['items'][number]

/** Motifs de refus de la modale (MOTIFS_REFUS_DEMANDE) ↔ code stable envoyé au contrat. */
export const MOTIFS_REFUS: Record<string, string> = {
  'Informations incomplètes': 'incomplete',
  'Activité hors périmètre': 'out_of_scope',
  'Doublon d’une association existante': 'duplicate',
  'Autre': 'other',
}
const libelleMotif = (code: string | null) => Object.entries(MOTIFS_REFUS).find(([, c]) => c === code)?.[0] ?? code ?? undefined

/** Emails des demandes de la maquette : domaine non fourni (`m.ouattara@[domaine]`), responsable inconnu (`[email]`). */
function emailDemande(e: string): string {
  if (e === 'responsable@domaine.example') return '[email]'
  return e.endsWith('@domaine.example') ? e.replace(/@domaine\.example$/, '@[domaine]') : email(e)
}

const TYPES: TypeAssociation[] = ['association', 'mutuelle', 'tontine', 'groupement', 'autre']
const type = (t: string): TypeAssociation => (TYPES.includes(t as TypeAssociation) ? t as TypeAssociation : 'autre')

/** Ligne de liste (champs absents du résumé : placeholders de la maquette). */
export function vueDemande(r: Resume): Demande {
  return {
    id: r.id,
    reference: r.reference,
    recueLe: local(r.createdAt),
    statut: STATUT_DEMANDE[r.status]!,
    association: { nom: r.associationName, type: type(r.associationType), ville: r.city, pays: r.country, description: '[DESCRIPTION]' },
    responsable: { prenom: r.contact.firstName, nom: r.contact.lastName, fonction: '[FONCTION]', email: emailDemande(r.contact.email), telephone: '[TÉLÉPHONE]' },
    besoins: { souscripteursEstimes: TRANCHES_SOUSCRIPTEURS[r.estimatedSubscribers] ?? r.estimatedSubscribers, projetsEnvisages: '[N]', planSouhaiteId: r.desiredPlan?.id ?? '', source: '[SOURCE]' },
    cguAcceptees: true,
  }
}

/** Détail d'une demande et sa frise (reçue, consultée, décision). `plan` / `comptes` : association créée à l'approbation. */
export function vueDemandeDetaillee(d: AssociationRequestDetail, attribution?: { planId: string, planNom: string, comptes: number | null }): DemandeDetaillee {
  const base = vueDemande(d)
  const vue: Demande = {
    ...base,
    association: { nom: d.association.name, type: type(d.association.type), ville: d.association.city, pays: d.association.country, numeroEnregistrement: d.association.registrationNumber ?? undefined, description: d.association.activityDescription },
    responsable: { prenom: d.contact.firstName, nom: d.contact.lastName, fonction: d.contact.title, email: base.responsable.email, telephone: d.contact.phone === '+2250700000000' ? '+225 07 [XX XX XX XX]' : tel(d.contact.phone) },
    besoins: {
      souscripteursEstimes: TRANCHES_SOUSCRIPTEURS[d.needs.estimatedSubscribers] ?? d.needs.estimatedSubscribers,
      projetsEnvisages: trancheProjets(d.needs.plannedProjects),
      planSouhaiteId: d.needs.desiredPlanId ?? '',
      source: d.needs.acquisitionSource ?? '[SOURCE]',
    },
    ...(d.viewedAt ? { consulteeLe: local(d.viewedAt) } : {}),
    ...(d.decision
      ? {
          decideLe: jour(d.decision.decidedAt),
          decidePar: d.decision.decidedBy.id,
          ...(d.status === 'rejected' ? { motifRefus: libelleMotif(d.decision.rejectionReasonCode), precisionsRefus: d.decision.rejectionMessage ?? undefined, refusEnvoyeLe: jour(d.decision.decidedAt) } : {}),
          ...(d.status === 'approved' ? { associationId: d.decision.associationId ?? undefined, planAttribueId: attribution?.planId ?? d.needs.desiredPlanId ?? undefined, comptesGestionnaires: attribution?.comptes ?? undefined } : {}),
        }
      : {}),
    noteInterne: d.internalNote ?? undefined,
  }
  const evts: EvenementDemande[] = [{ id: 'recue', titre: 'Demande reçue', date: vue.recueLe, ton: 'info' }]
  if (d.viewedAt) evts.push({ id: 'consultee', titre: `Consultée par ${d.viewedBy?.firstName ?? 'la plateforme'}`, date: local(d.viewedAt), ton: 'brand' })
  if (d.decision && d.status === 'approved') {
    evts.push({ id: 'decision', titre: 'Approuvée — espace créé', date: jour(d.decision.decidedAt), detail: [`par ${d.decision.decidedBy.firstName}`, attribution && `plan ${attribution.planNom}`].filter(Boolean).join(' · '), ton: 'success' })
  }
  if (d.decision && d.status === 'rejected') {
    evts.push({ id: 'decision', titre: 'Refusée', date: jour(d.decision.decidedAt), detail: [`par ${d.decision.decidedBy.firstName}`, vue.motifRefus].filter(Boolean).join(' · '), ton: 'danger' })
  }
  return { ...vue, historique: evts }
}

/** Formulaire public `/demande` → `AssociationRequestInput` (anti-robot ALTCHA au lot 1.3 : jeton factice d'ici là). */
export function versDemande(d: NouvelleDemande) {
  const tranche = Object.entries(TRANCHES_SOUSCRIPTEURS).find(([, libelle]) => libelle === d.besoins.souscripteursEstimes)?.[0] ?? '1_20'
  return {
    association: { name: d.association.nom, type: d.association.type, city: d.association.ville, country: d.association.pays, registrationNumber: d.association.numeroEnregistrement ?? null, activityDescription: d.association.description },
    contact: { firstName: d.responsable.prenom, lastName: d.responsable.nom, title: d.responsable.fonction, email: d.responsable.email, phone: versE164(d.responsable.telephone) },
    needs: {
      estimatedSubscribers: tranche as '1_20',
      plannedProjects: TRANCHES_PROJETS.find(t => t.libelle === d.besoins.projetsEnvisages)?.valeur ?? null,
      desiredPlanId: d.besoins.planSouhaiteId || null,
      acquisitionSource: d.besoins.source || null,
    },
    termsAccepted: true as const,
    altcha: 'altcha-lot-1.3',
  }
}
