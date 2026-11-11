// Abonnement Web Push mémorisé par l'appareil (me.push, lot 4.2) : son id (pour le retirer) et la personne à qui il
// appartient. Sur un appareil partagé, un abonnement d'une autre personne (session expirée sans déconnexion) est
// retiré du navigateur dès qu'une autre personne ouvre Cotiz : jamais ses notifications à la suivante.

export interface AbonnementMemorise {
  id: string
  userId: string
}

/** Lecture tolérante : ancien format (id seul), JSON abîmé ou incomplet → `null` (propriétaire inconnu). */
export function lireAbonnementMemorise(brut: string | null): AbonnementMemorise | null {
  if (!brut) return null
  try {
    const v = JSON.parse(brut) as Partial<AbonnementMemorise> | null
    return v && typeof v.id === 'string' && v.id && typeof v.userId === 'string' && v.userId ? { id: v.id, userId: v.userId } : null
  }
  catch {
    return null
  }
}

/**
 * Que faire de l'abonnement présent dans le navigateur pour `userId` : `garder` s'il est mémorisé pour cette personne,
 * `retirer` sinon (autre personne, ou propriétaire inconnu : on ne prend pas le risque) ; `rien` sans abonnement.
 */
export function decisionAbonnement(
  dansLeNavigateur: boolean,
  memorise: AbonnementMemorise | null,
  userId: string,
): 'garder' | 'retirer' | 'rien' {
  if (!dansLeNavigateur) return 'rien'
  return memorise?.userId === userId ? 'garder' : 'retirer'
}
