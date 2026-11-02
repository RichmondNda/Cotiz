// Paiements : PaymentSummary / PaymentDetail / SubscriberPayment et Installment du contrat → types d'interface.
import type { Installment, PaymentDetail, PaymentSummary, SubscriberPayment } from '@cotiz/contracts'
import type { Association, Echeance, Paiement, PaiementDetail, PaiementListe, Preuve, Projet, Souscripteur, Souscription } from '~~/types'
import { ECHEANCE_FERMEE, jour, m, MOTIF_REJET, MOYEN, STATUT_ECHEANCE, STATUT_PAIEMENT } from './communs'

/** Échéance du contrat → échéance de l'interface (grilles, échéanciers, couvertures). */
export function vueEcheance(i: Installment, souscripteurId: string): Echeance {
  return {
    id: i.id, projetId: i.projectId, souscripteurId, rang: i.sequence, estFondsEntree: i.kind === 'entry_fee', date: i.dueDate,
    montant: m(i.amountDue), montantPaye: m(i.amountPaid), statut: STATUT_ECHEANCE[i.status]!,
    ...(ECHEANCE_FERMEE(i.status) ? { fermee: true } : {}),
  }
}

/** Preuve : fichier (image ou PDF, URL de dépôt non servie en V0 → `[URL]`) ou référence de transaction seule. */
function preuve(p: PaymentSummary['proof']): Preuve {
  if (!p.fileId) return { type: 'reference', reference: p.transactionReference ?? '[RÉFÉRENCE]' }
  return { type: p.mimeType === 'application/pdf' ? 'pdf' : 'image', nomFichier: p.fileName ?? '[FICHIER]', url: '[URL]', ...(p.transactionReference ? { reference: p.transactionReference } : {}) }
}

type Commun = Pick<PaymentSummary, 'id' | 'status' | 'amountDeclared' | 'amountReceived' | 'paidOn' | 'declaredAt' | 'paymentMethodKind' | 'covered' | 'proof' | 'reviewedAt'>

/** Paiement de l'interface (montants, moyen, répartition, décision). `ajuste` / `rejet` : détail seulement. */
export function vuePaiement(p: Commun, x: { souscripteurId: string, projetId: string, associationId: string, traitePar?: string, ajuste?: boolean, rejet?: { reasonCode: keyof typeof MOTIF_REJET, message: string | null } | null, commentaire?: string | null }): Paiement {
  return {
    id: p.id, souscripteurId: x.souscripteurId, projetId: x.projetId, associationId: x.associationId,
    montant: m(p.amountDeclared), ...(p.amountReceived ? { montantRecu: m(p.amountReceived) } : {}),
    moyen: MOYEN[p.paymentMethodKind ?? 'mobile_money'] ?? 'mobile_money', dateVirement: p.paidOn, declareLe: jour(p.declaredAt),
    preuve: preuve(p.proof), ...(x.commentaire ? { commentaire: x.commentaire } : {}),
    repartition: p.covered.map(c => ({ echeanceId: c.installmentId, montantAffecte: m(c.amount) })),
    repartitionAjustee: x.ajuste ?? false, statut: STATUT_PAIEMENT[p.status]!,
    ...(p.reviewedAt ? { traiteLe: jour(p.reviewedAt) } : {}), ...(x.traitePar ? { traitePar: x.traitePar } : {}),
    ...(x.rejet ? { motifRejet: MOTIF_REJET[x.rejet.reasonCode], ...(x.rejet.message ? { messageRejet: x.rejet.message } : {}) } : {}),
  }
}

/** Échéances couvertes : échéances complètes connues, sinon reconstruites depuis la couverture. */
function couvertes(p: Commun, echeances: Map<string, Echeance>, souscripteurId: string, projetId: string): Echeance[] {
  return p.covered.map(c => echeances.get(c.installmentId) ?? {
    id: c.installmentId, projetId, souscripteurId, rang: c.sequence, estFondsEntree: c.kind === 'entry_fee', date: c.dueDate,
    montant: m(c.amount), montantPaye: 0, statut: 'a_venir' as const,
  })
}

export interface Contexte {
  echeances: Map<string, Echeance>
  projets: Map<string, Projet>
  souscripteurs: Map<string, Souscripteur>
  associationId: string
}

/** Ligne des listes gestionnaire (file de validation, liste du projet, tableau de bord). */
export function vuePaiementListe(p: PaymentSummary, c: Contexte): PaiementListe {
  const sid = p.member.id
  const nomValideur = p.reviewedBy ? `${p.reviewedBy.firstName} ${p.reviewedBy.lastName}`.trim() : undefined
  return {
    ...vuePaiement(p, { souscripteurId: sid, projetId: p.project.id, associationId: c.associationId, traitePar: p.reviewedBy?.id }),
    souscripteur: c.souscripteurs.get(sid) ?? { id: sid, prenom: p.member.firstName, nom: p.member.lastName, telephone: '+225 [XX XX XX XX]', associationIds: [c.associationId], membreDepuis: '[DATE]' },
    projet: c.projets.get(p.project.id)!,
    ...(nomValideur ? { traiteParNom: nomValideur } : {}),
    echeancesCouvertes: couvertes(p, c.echeances, sid, p.project.id),
  }
}

/** Détail gestionnaire (MgPaiement) : échéancier, inscription (reste à payer) et 3 derniers versements validés. */
export function vuePaiementDetail(p: PaymentDetail, c: Contexte & { association: Association, inscriptions: Map<string, Souscription> }): PaiementDetail {
  const sid = p.member.id
  const echeancier = p.schedule.map(i => vueEcheance(i, sid))
  const parId = new Map(echeancier.map(e => [e.id, e]))
  const liste = vuePaiementListe(p, { ...c, echeances: new Map([...c.echeances, ...parId]) })
  const souscription = c.inscriptions.get(`${sid}:${p.project.id}`)
  return {
    ...liste,
    ...vuePaiement(p, { souscripteurId: sid, projetId: p.project.id, associationId: c.associationId, traitePar: p.reviewedBy?.id, ajuste: p.allocationAdjusted, rejet: p.rejection, commentaire: p.comment }),
    echeances: liste.echeancesCouvertes,
    association: c.association,
    ...(souscription ? { souscription } : {}),
    etat: { version: p.version, devise: p.amountDeclared.currency },
    echeancier,
    derniersVersements: p.recentPayments.flatMap(r => r.covered.map(cv => ({
      echeanceId: cv.installmentId, date: jour(r.reviewedAt ?? r.declaredAt), montant: m(cv.amount),
      ...(r.reviewedBy ? { traiteParNom: `${r.reviewedBy.firstName} ${r.reviewedBy.lastName}`.trim() } : {}),
    }))).slice(0, 3),
  }
}

/** Paiement vu par le souscripteur (historique, accueil, confirmation de déclaration). */
export function vuePaiementSouscripteur(p: SubscriberPayment, c: { echeances: Map<string, Echeance>, projets: Map<string, Projet>, moi: Souscripteur }): PaiementListe {
  return {
    ...vuePaiement(p, { souscripteurId: c.moi.id, projetId: p.project.id, associationId: p.association.id, rejet: p.rejection }),
    souscripteur: c.moi,
    projet: c.projets.get(p.project.id)!,
    echeancesCouvertes: couvertes(p, c.echeances, c.moi.id, p.project.id),
  }
}
