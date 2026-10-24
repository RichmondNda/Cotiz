// Associations : réponses du contrat (Association, PaymentMethod, PlatformAssociation*) → types d'interface.
import type { CallOutput } from '@cotiz/api-client'
import { ENDPOINTS } from '@cotiz/contracts'
import type { Association as AssociationContrat, PaymentMethod, PlatformAssociationDetail } from '@cotiz/contracts'
import type {
  Association, AssociationListe, EvenementPlateforme, FicheAssociationPlateforme, ModalitePaiement, MoyenPaiement, Plan, Quota, QuotaUtilise,
  StatutFacture,
  TonEvenement, TypeAssociation,
} from '~~/types'
import { formatDate, formatFCFA, formatMois, initiales } from '~/utils/format'
import { email, jour, m, MOYEN, OPERATEURS, SITUATION, STATUT_ASSOCIATION, STATUT_PROJET, tel, versE164 } from './communs'

const TYPES: TypeAssociation[] = ['association', 'mutuelle', 'tontine', 'groupement', 'autre']
const type = (t: string): TypeAssociation => (TYPES.includes(t as TypeAssociation) ? t as TypeAssociation : 'autre')

/** Moyens de paiement du contrat → modalités de l'interface (« Comment payer », paramètres, onboarding). */
export function vueModalites(moyens: PaymentMethod[]): ModalitePaiement[] {
  return moyens.filter(x => x.isActive).map(x => ({
    moyen: MOYEN[x.kind]!,
    ...(x.details.iban ? { iban: x.details.iban } : {}),
    ...(x.details.number ? { numeroMobileMoney: x.details.number.startsWith('+') && /^\+\d+$/.test(x.details.number) ? tel(x.details.number) : x.details.number } : {}),
    ...(x.kind === 'mobile_money' ? { operateur: OPERATEURS[x.details.operator ?? ''] ?? x.details.operator ?? x.label } : {}),
    ...(x.instructions ? { instructions: x.instructions } : {}),
  }))
}

/** Opérateur saisi (« Orange », « MTN MoMo »…) → code du contrat (contenu dans la saisie) ; inconnu : la saisie, refusée par le back. */
function codeOperateur(saisie: string): string {
  const texte = saisie.trim().toLowerCase()
  return Object.keys(OPERATEURS).find(code => texte.includes(code)) ?? saisie.trim()
}

/** Modalités saisies (onboarding, paramètres) → liste complète `as.pm.replace` (`details` selon le moyen, contrat). */
export function versMoyens(modalites: ModalitePaiement[], instructions?: string) {
  return modalites.map((x): { kind: PaymentMethod['kind'], label: string, details: Record<string, string>, instructions: string | null, isActive: boolean } => {
    if (x.moyen === 'mobile_money') {
      const operator = codeOperateur(x.operateur ?? '')
      const details = { operator, number: x.numeroMobileMoney ? versE164(x.numeroMobileMoney) : '' }
      return {
        kind: 'mobile_money', label: OPERATEURS[operator] ?? (x.operateur || 'Mobile money'),
        details: Object.fromEntries(Object.entries(details).filter(([, v]) => v)), instructions: x.instructions ?? null, isActive: true,
      }
    }
    if (x.moyen === 'virement') {
      return {
        kind: 'bank_transfer', label: 'Virement bancaire', details: x.iban ? { iban: x.iban } : {},
        instructions: x.instructions ?? instructions ?? null, isActive: true,
      }
    }
    return { kind: 'cash', label: 'Espèces', details: {}, instructions: x.instructions ?? null, isActive: true }
  })
}

/** Message affiché sous le champ d'un moyen, selon le champ refusé par le contrat. */
export const MESSAGE_OPERATEUR = 'Précisez l’opérateur : Orange, MTN, Moov ou Wave.'
const MESSAGES_MOYEN: Record<string, string> = {
  'details.operator': MESSAGE_OPERATEUR,
  'details.number': 'Indiquez un numéro de téléphone valide.',
  'details.iban': 'Indiquez un IBAN valide.',
  'instructions': 'Précisez les instructions de paiement.',
}

/**
 * Modalités saisies refusées par le contrat de `as.pm.replace` (même schéma que le back) : message par moyen, avant
 * l'envoi. Aucune erreur : objet vide.
 */
export function erreursMoyens(modalites: ModalitePaiement[], instructions?: string): Partial<Record<MoyenPaiement, string>> {
  const resultat = ENDPOINTS['as.pm'].operations.replace.request.body.safeParse({ items: versMoyens(modalites, instructions) })
  const erreurs: Partial<Record<MoyenPaiement, string>> = {}
  for (const issue of resultat.error?.issues ?? []) {
    const [racine, index, ...champ] = issue.path.map(String)
    const moyen = racine === 'items' ? modalites[Number(index)]?.moyen : undefined
    if (moyen && !erreurs[moyen]) erreurs[moyen] = MESSAGES_MOYEN[champ.join('.')] ?? 'Vérifiez ce moyen de paiement.'
  }
  return erreurs
}

interface Compteurs { projets: number, souscripteurs: number, gestionnaires: number, limiteSecondaires?: number, prochaineEcheance?: string, planId: string }

/** Association vue par son gestionnaire (`as.get` + moyens + compteurs du tableau de bord et de l'abonnement). */
export function vueAssociation(a: AssociationContrat, moyens: PaymentMethod[], c: Compteurs): Association {
  const virement = moyens.find(x => x.kind === 'bank_transfer')
  return {
    id: a.id, nom: a.name, sigle: initiales(a.name), type: type(a.type), ville: a.city, pays: a.country,
    description: a.description ?? undefined, logoUrl: a.logoFileId ? '[LOGO]' : undefined,
    telephoneContact: tel(a.contactPhone), emailContact: email(a.contactEmail), statut: STATUT_ASSOCIATION[a.status]!,
    planId: c.planId, abonnementProchaineEcheance: c.prochaineEcheance ?? '[DATE]', modalitesPaiement: vueModalites(moyens),
    instructionsPaiement: virement?.instructions ?? undefined, nbProjets: c.projets, nbSouscripteurs: c.souscripteurs,
    nbGestionnaires: c.gestionnaires, limiteComptesSecondaires: c.limiteSecondaires, creeeLe: '[DATE]',
  }
}

type Resume = CallOutput<'pf.asso.list', 'list'>['items'][number]

/** Ligne de SaAssociations. */
export function vueAssociationListe(a: Resume): AssociationListe {
  return {
    id: a.id, nom: a.name, sigle: initiales(a.name), ville: a.city, pays: a.country, statut: STATUT_ASSOCIATION[a.status]!,
    planId: a.plan.id, modalitesPaiement: [], nbProjets: a.projectsCount, nbSouscripteurs: a.subscribersCount, nbGestionnaires: 0,
    creeeLe: jour(a.createdAt), planNom: a.plan.name, derniereActivite: jour(a.lastActivityAt ?? a.createdAt),
  }
}

/** Libellé et ton des événements de la frise plateforme (types d'événements du contrat). */
const EVENEMENTS: Record<string, { titre: string, ton: TonEvenement }> = {
  'association.created': { titre: 'Espace créé', ton: 'info' },
  'association.updated': { titre: 'Informations modifiées', ton: 'info' },
  'plan.changed': { titre: 'Changement de plan', ton: 'brand' },
  'manager.added': { titre: 'Gestionnaire ajoutée', ton: 'success' },
  'subscription.past_due': { titre: 'Abonnement impayé', ton: 'warning' },
  'onboarding.in_progress': { titre: 'Onboarding en cours', ton: 'info' },
  'request.approved': { titre: 'Demande approuvée', ton: 'success' },
  'association.suspended': { titre: 'Association suspendue', ton: 'danger' },
  'association.reactivated': { titre: 'Association réactivée', ton: 'success' },
}

/** Activité du tableau de bord plateforme (« Nouvelle association · Jeunesse solidaire de Bouaké · 24 sept. »). */
const ACTIVITE: Record<string, { titre: string, ton: TonEvenement }> = {
  'association.created': { titre: 'Nouvelle association', ton: 'info' },
  'subscription.past_due': { titre: 'Abonnement impayé', ton: 'warning' },
  'plan.changed': { titre: 'Changement de plan', ton: 'brand' },
  'request.approved': { titre: 'Demande approuvée', ton: 'success' },
  'association.suspended': { titre: 'Association suspendue', ton: 'danger' },
  'association.reactivated': { titre: 'Association réactivée', ton: 'success' },
}

export function vueActivite(a: { type: string, at: string, associationName: string }, i: number): EvenementPlateforme {
  const e = ACTIVITE[a.type] ?? { titre: a.type, ton: 'info' as const }
  return { id: `ac-${i}`, titre: e.titre, detail: `${a.associationName.replace(/^Association /, 'Assoc. ')} · ${formatDate(jour(a.at), 'jour-mois')}`, ton: e.ton }
}

const FACTURE: Record<string, StatutFacture> = { draft: 'a_venir', open: 'en_attente', paid: 'payee', overdue: 'impayee', void: 'payee' }
export const statutFacture = (s: string): StatutFacture => FACTURE[s] ?? 'a_venir'

function quota(utilise: number, limite: number | null): QuotaUtilise {
  return { utilise, limite: limite as Quota, pourcentage: limite ? Math.min(100, Math.round(utilise / limite * 100)) : 0 }
}

interface Onglets {
  projets: { id: string, name: string, status: string, subscribersCount: number, collected: { amount: number }, createdAt: string }[]
  totalProjets: number
  membres: { user: { id: string, firstName: string, lastName: string, phone: string | null }, projectsCount: number, standing: string }[]
  totalMembres: number
  factures: { id: string, periodStart: string, amount: { amount: number }, status: string, dueAt: string | null }[]
  requis: Record<string, number | null>
}

/** Fiche plateforme (SaAssociation) : détail, onglets projets / souscripteurs / factures. */
export function vueFiche(d: PlatformAssociationDetail, plan: Plan, o: Onglets): FicheAssociationPlateforme {
  const owner = d.owner
  const nomContact = `${owner.firstName} ${owner.lastName}`.trim()
  const impayee = o.factures.find(f => f.status === 'overdue')
  const finPeriode = d.subscription.currentPeriodEnd
  return {
    association: {
      id: d.id, nom: d.name, sigle: initiales(d.name), type: type(d.type), ville: d.city, pays: d.country, description: d.description ?? undefined,
      telephoneContact: tel(d.contactPhone), emailContact: email(d.contactEmail), statut: STATUT_ASSOCIATION[d.status]!, planId: d.plan.id,
      modalitesPaiement: [], nbProjets: d.projectsCount, nbSouscripteurs: d.subscribersCount, nbGestionnaires: d.managers.length,
      limiteComptesSecondaires: d.subscription.managerSeatsOverride ?? undefined, creeeLe: jour(d.createdAt),
    },
    plan,
    contact: { nom: nomContact || '[Responsable]', initiales: nomContact && !nomContact.startsWith('[') ? initiales(nomContact) : '··', role: 'Gestionnaire principal', email: email(owner.email), telephone: tel(owner.phone, '+225 [XX XX XX XX XX]') },
    kpi: { projetsActifs: d.kpi.activeProjects, souscripteurs: d.kpi.subscribers, collecteCumule: m(d.kpi.collectedTotal), tauxRecouvrement: d.kpi.recoveryRate == null ? null : Math.round(d.kpi.recoveryRate * 100) },
    abonnement: { prixMensuel: m(d.subscription.price), prochaineEcheance: finPeriode ? lendemain(finPeriode) : '[DATE]' },
    quotas: { projets: quota(d.quotas.projects.used, d.quotas.projects.limit), souscripteurs: quota(d.quotas.subscribers.used, d.quotas.subscribers.limit), gestionnaires: quota(d.quotas.managers.used, d.quotas.managers.limit) },
    evenements: d.events.map((e, i) => ({ id: `ev-${i}`, titre: EVENEMENTS[e.type]?.titre ?? e.type, detail: e.detail ?? formatDate(jour(e.at)), ton: EVENEMENTS[e.type]?.ton ?? 'info' })),
    projets: o.projets.map(p => ({
      id: p.id, nom: p.name, statut: STATUT_PROJET[p.status] ?? null,
      souscripteurs: o.requis[p.id] ? `${p.subscribersCount} / ${o.requis[p.id]}` : String(p.subscribersCount),
      collecte: p.status === 'enrolling' ? '—' : formatFCFA(p.collected.amount), creeLe: formatMois(jour(p.createdAt)),
    })),
    souscripteurs: o.membres.map(x => ({ id: x.user.id, nom: `${x.user.firstName} ${x.user.lastName}`.trim(), telephone: tel(x.user.phone), projets: String(x.projectsCount), statut: SITUATION[x.standing] ?? null })),
    factures: o.factures.map(f => ({ id: f.id, periode: f.periodStart, montant: f.amount.amount, statut: statutFacture(f.status) })),
    ...(d.status === 'past_due' && impayee ? { impaye: { depuis: jour(impayee.dueAt ?? impayee.periodStart), suspensionLe: '[DATE]' } } : {}),
    ...(d.suspendedAt ? { suspendueLe: jour(d.suspendedAt) } : {}),
  }
}

/** Jour suivant une date `AAAA-MM-JJ` (prochaine échéance d'abonnement = lendemain de la fin de période). */
function lendemain(d: string): string {
  const t = new Date(`${d}T00:00:00Z`)
  t.setUTCDate(t.getUTCDate() + 1)
  return t.toISOString().slice(0, 10)
}
