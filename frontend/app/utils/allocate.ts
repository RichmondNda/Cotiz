// Répartition d'un montant déclaré sur des échéances (port typé de `Cotiz.allocate`, design-system/bundle.js).
// Pré-sélection du sélecteur d'échéances couvertes : de la plus ancienne non payée à la plus récente,
// jusqu'à épuisement du montant. La dernière couverte peut être partielle.

export interface EcheanceARepartir {
  id: string
  montant: number
  /** Déjà payé (validé) sur cette échéance. */
  montantPaye?: number
  label?: string
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

/** Les échéances doivent être fournies dans l'ordre (la plus ancienne d'abord). */
export function allocate(montant: number, echeances: EcheanceARepartir[]): Repartition {
  let reste = Math.max(0, montant)
  const lignes = echeances.map((e): LigneRepartition => {
    const du = Math.max(0, e.montant - (e.montantPaye ?? 0))
    const affecte = Math.max(0, Math.min(du, reste))
    reste -= affecte
    return {
      id: e.id,
      label: e.label,
      montant: e.montant,
      du,
      affecte,
      etat: affecte === 0 ? 'none' : affecte < du ? 'partial' : 'full',
    }
  })
  return { lignes, reste, couvertes: lignes.filter(l => l.affecte > 0).length }
}

/**
 * Ajustement manuel : les lignes cochées reçoivent leur dû dans l'ordre ; le « reste à répartir »
 * peut devenir négatif (sur-répartition), ce qui bloque l'envoi.
 */
export function repartitionManuelle(montant: number, echeances: EcheanceARepartir[], cochees: Set<string>): Repartition {
  let reste = montant
  const lignes = echeances.map((e): LigneRepartition => {
    const du = Math.max(0, e.montant - (e.montantPaye ?? 0))
    if (!cochees.has(e.id)) return { id: e.id, label: e.label, montant: e.montant, du, affecte: 0, etat: 'none' }
    const affecte = reste >= du ? du : Math.max(0, reste)
    reste -= du
    return { id: e.id, label: e.label, montant: e.montant, du, affecte, etat: affecte === 0 ? 'none' : affecte < du ? 'partial' : 'full' }
  })
  return { lignes, reste, couvertes: lignes.filter(l => l.affecte > 0).length }
}
