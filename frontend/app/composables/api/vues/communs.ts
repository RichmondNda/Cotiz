// Adaptation des réponses du contrat (@cotiz/contracts, anglais) aux types d'interface des écrans (`~~/types`).
// Renommages et libellés seulement (docs/specs/v0-mapping.md § 1) : aucun calcul métier, les chiffres viennent de l'API.
// Champ nullable sans valeur → placeholder de la maquette (règle de docs/placeholders-v0.md, repli d'interface).
import type { Money } from '@cotiz/contracts'
import type {
  Frequence, MoyenPaiement, StatutAssociation, StatutDemande, StatutEcheance, StatutPaiement, StatutProjet,
  StatutSouscription, TypeCalendrier,
} from '~~/types'

/** Montant du contrat → entier F CFA de l'interface. */
export const m = (x: Money): number => x.amount
export const mOu = <T>(x: Money | null | undefined, repli: T): number | T => (x ? x.amount : repli)

/** Instant UTC (`…Z`) → date-heure locale de l'interface (Abidjan = UTC : même jour, même heure). */
export const local = (instant: string): string => instant.replace(/Z$/, '').replace(/\.\d+$/, '')
/** Instant ou date → jour `AAAA-MM-JJ`. */
export const jour = (iso: string): string => iso.slice(0, 10)
export const jourOu = (iso: string | null | undefined, repli = '[DATE]'): string => (iso ? jour(iso) : repli)

/** Téléphone E.164 → affichage groupé ; absent → placeholder de la maquette. */
export function tel(phone: string | null | undefined, repli = '+225 [XX XX XX XX]'): string {
  if (!phone) return repli
  const digits = phone.replace(/^\+/, '')
  return digits.startsWith('225') ? `+225 ${digits.slice(3).replace(/(\d{2})(?=\d)/g, '$1 ')}` : phone
}

/** Email absent, ou adresse réservée `.example` des mocks (RFC 2606) → placeholder `[email]`. */
export const email = (e: string | null | undefined): string => (!e || /\.example$/i.test(e) ? '[email]' : e)

/** Saisie d'un téléphone ivoirien (`05 44 21 87 90`) → E.164 (`+2250544218790`). */
export function versE164(saisie: string): string {
  const c = saisie.replace(/\D/g, '')
  const national = c.startsWith('225') && c.length === 13 ? c.slice(3) : c
  return `+225${national}`
}

/** Pourcentage entier de l'interface (82) à partir d'un taux 0–1 ; `null` → `[N]`. */
export const pourcent = (taux: number | null | undefined): number | '[N]' => (taux == null ? '[N]' : Math.round(taux * 100))

// ---------------------------------------------------------------- Énumérations (v0-mapping § 1)

export const STATUT_PROJET: Record<string, StatutProjet> = { draft: 'brouillon', enrolling: 'inscriptions_ouvertes', active: 'en_cours', completed: 'termine', archived: 'termine' }
export const STATUT_PROJET_INVERSE: Record<StatutProjet, string> = { brouillon: 'draft', inscriptions_ouvertes: 'enrolling', en_cours: 'active', termine: 'completed' }

/** `due` (échue, dans le délai de grâce) est affiché « À venir » (décision 11). */
export const STATUT_ECHEANCE: Record<string, StatutEcheance> = { upcoming: 'a_venir', due: 'a_venir', declared: 'declaree', partial: 'partielle', paid: 'payee', late: 'en_retard', waived: 'payee', canceled: 'a_venir' }

/** Échéances fermées du registre (n'acceptent plus de paiement). */
export const ECHEANCE_FERMEE = (status: string): boolean => status === 'canceled' || status === 'waived'

export const STATUT_PAIEMENT: Record<string, StatutPaiement> = { pending: 'en_attente', validated: 'valide', rejected: 'rejete', canceled: 'rejete' }
export const STATUT_PAIEMENT_INVERSE: Record<StatutPaiement, string> = { en_attente: 'pending', valide: 'validated', rejete: 'rejected' }

export const SITUATION: Record<string, StatutSouscription> = { signature_required: 'signature_attendue', up_to_date: 'a_jour', late: 'en_retard', withdrawn: 'a_jour', activation_pending: 'a_jour' }

export const STATUT_ASSOCIATION: Record<string, StatutAssociation> = { active: 'active', past_due: 'impayee', suspended: 'suspendue', onboarding: 'onboarding', closed: 'suspendue' }
export const STATUT_ASSOCIATION_INVERSE: Record<StatutAssociation, string> = { active: 'active', impayee: 'past_due', suspendue: 'suspended', onboarding: 'onboarding' }

export const STATUT_DEMANDE: Record<string, StatutDemande> = { pending: 'a_traiter', approved: 'approuvee', rejected: 'refusee' }
export const STATUT_DEMANDE_INVERSE: Record<StatutDemande, string> = { a_traiter: 'pending', approuvee: 'approved', refusee: 'rejected' }

export const MOYEN: Record<string, MoyenPaiement> = { bank_transfer: 'virement', mobile_money: 'mobile_money', cash: 'especes', other: 'especes' }
export const MOYEN_INVERSE: Record<MoyenPaiement, 'bank_transfer' | 'mobile_money' | 'cash'> = { virement: 'bank_transfer', mobile_money: 'mobile_money', especes: 'cash' }

export const FREQUENCE: Record<string, Frequence> = { weekly: 'hebdomadaire', monthly: 'mensuelle', quarterly: 'trimestrielle', semiannual: 'semestrielle', annual: 'annuelle' }
export const FREQUENCE_INVERSE: Record<Frequence, 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'annual'> = { hebdomadaire: 'weekly', mensuelle: 'monthly', trimestrielle: 'quarterly', semestrielle: 'semiannual', annuelle: 'annual' }

export const CALENDRIER: Record<string, TypeCalendrier> = { fixed: 'dates_fixes', rolling: 'cycle_roulant' }
export const CALENDRIER_INVERSE: Record<TypeCalendrier, 'fixed' | 'rolling'> = { dates_fixes: 'fixed', cycle_roulant: 'rolling' }

export const MOTIF_REJET = { unreadable_proof: 'preuve_illisible', not_received: 'montant_non_recu', amount_mismatch: 'montant_different', other: 'autre' } as const
export const MOTIF_REJET_INVERSE = { preuve_illisible: 'unreadable_proof', montant_non_recu: 'not_received', montant_different: 'amount_mismatch', autre: 'other' } as const

/** Opérateurs mobile money connus (`details.operator`) → libellé ; inconnu → tel quel. */
export const OPERATEURS: Record<string, string> = { orange: 'Orange Money', mtn: 'MTN MoMo', moov: 'Moov Money', wave: 'Wave' }

/** Tranches de souscripteurs estimés (`estimated_subscribers`) ↔ libellés du sélecteur de /demande (écart R8). */
export const TRANCHES_SOUSCRIPTEURS: Record<string, string> = { '1_20': '1 à 20', '21_50': '21 à 50', '51_200': '51 à 200', '201_500': '201 à 500', '500_plus': 'Plus de 500' }
/** Projets envisagés : entier du contrat ↔ tranche du sélecteur. */
export const TRANCHES_PROJETS: { valeur: number, libelle: string }[] = [
  { valeur: 1, libelle: '1' }, { valeur: 2, libelle: '2 à 3' }, { valeur: 4, libelle: '3 à 5' }, { valeur: 6, libelle: 'Plus de 5' },
]
export const trancheProjets = (n: number | null | undefined): string =>
  n == null ? '[N]' : [...TRANCHES_PROJETS].reverse().find(t => n >= t.valeur)?.libelle ?? String(n)
