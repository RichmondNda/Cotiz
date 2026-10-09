// Répartition d'un montant déclaré sur des échéances : sélecteur d'échéances couvertes (déclaration, validation).
// Pré-sélection = `proposeAllocation` de @cotiz/domain (règle n° 2) : de la plus ancienne non soldée à la plus récente,
// jusqu'à épuisement du montant ; la dernière couverte peut être partielle. Ce fichier ne fait qu'adapter l'interface.
import { DomainError, proposeAllocation, remainingOf } from '@cotiz/domain'
import type { LedgerInstallment } from '@cotiz/domain'

export interface EcheanceARepartir {
  id: string
  montant: number
  /** Déjà payé (validé) sur cette échéance. */
  montantPaye?: number
  label?: string
  /** Annulée ou dispensée : n'accepte plus de paiement (rien à répartir dessus). */
  fermee?: boolean
}

export type EtatLigne = 'none' | 'partial' | 'full'

export interface LigneRepartition {
  id: string
  label?: string
  montant: number
  /** Reste dû sur l'échéance avant ce paiement. */
  du: number
  affecte: number
  etat: EtatLigne
}

export interface Repartition {
  lignes: LigneRepartition[]
  /** Montant non réparti (> 0 si le montant dépasse ce qui est dû). */
  reste: number
  /** Nombre d'échéances touchées (entièrement ou partiellement). */
  couvertes: number
}

/**
 * Échéances de l'interface → échéances du registre, dans l'ordre fourni (la plus ancienne d'abord) :
 * le rang tient lieu d'ordre d'échéance. Les allocations en attente ne sont pas connues ici (le back les contrôle).
 */
function versRegistre(echeances: EcheanceARepartir[]): LedgerInstallment[] {
  return echeances.map((e, i) => ({
    id: e.id, enrollmentId: '', kind: 'periodic', sequence: i, dueDate: '2000-01-01', status: e.fermee ? 'canceled' : 'upcoming',
    amountDue: e.montant, amountPaid: Math.min(e.montant, Math.max(0, e.montantPaye ?? 0)), amountPending: 0,
  }))
}

/** Reste dû d'une échéance ; fermée (annulée, dispensée) : rien. */
const duDe = (e: EcheanceARepartir, x: LedgerInstallment) => (e.fermee ? 0 : remainingOf(x))

function ligne(e: EcheanceARepartir, du: number, affecte: number): LigneRepartition {
  return { id: e.id, label: e.label, montant: e.montant, du, affecte, etat: affecte === 0 ? 'none' : affecte < du ? 'partial' : 'full' }
}

/** Proposition du domaine ; montant au-delà du reste dû : répartition du maximum (`maxAmount`), l'excédent reste à répartir. */
function proposer(montant: number, registre: LedgerInstallment[]): { parts: Map<string, number>, reparti: number } {
  if (montant <= 0) return { parts: new Map(), reparti: 0 }
  try {
    return { parts: new Map(proposeAllocation(montant, registre).map(a => [a.installmentId, a.amount])), reparti: montant }
  }
  catch (e) {
    if (!(e instanceof DomainError && e.code === 'amount_exceeds_remaining')) throw e
    const max = e.details.maxAmount as number
    return max > 0 ? proposer(max, registre) : { parts: new Map(), reparti: 0 }
  }
}

/** Les échéances doivent être fournies dans l'ordre (la plus ancienne d'abord). Montant non entier : rien n'est réparti. */
export function allocate(montant: number, echeances: EcheanceARepartir[]): Repartition {
  const registre = versRegistre(echeances)
  const saisi = Number.isSafeInteger(montant) ? Math.max(0, montant) : 0
  const { parts, reparti } = proposer(saisi, registre)
  const lignes = echeances.map((e, i) => ligne(e, duDe(e, registre[i]!), parts.get(e.id) ?? 0))
  return { lignes, reste: saisi - reparti, couvertes: lignes.filter(l => l.affecte > 0).length }
}

/**
 * Ajustement manuel : les lignes cochées reçoivent leur dû dans l'ordre ; le « reste à répartir »
 * peut devenir négatif (sur-répartition), ce qui bloque l'envoi. Montant non entier : traité comme 0.
 */
export function repartitionManuelle(montant: number, echeances: EcheanceARepartir[], cochees: Set<string>): Repartition {
  const registre = versRegistre(echeances)
  let reste = Number.isSafeInteger(montant) ? montant : 0
  const lignes = echeances.map((e, i): LigneRepartition => {
    const du = duDe(e, registre[i]!)
    if (!cochees.has(e.id) || du === 0) return ligne(e, du, 0)
    const affecte = reste >= du ? du : Math.max(0, reste)
    reste -= du
    return ligne(e, du, affecte)
  })
  return { lignes, reste, couvertes: lignes.filter(l => l.affecte > 0).length }
}
