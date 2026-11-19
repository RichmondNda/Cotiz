// Règles d'affichage des projets du souscripteur, communes à l'accueil, aux associations et à la déclaration.
import type { StatutProjet, StatutSouscription, SouscriptionMembre } from '~~/types'

/** Déclaration d'un paiement avec le projet pré-sélectionné. */
export function lienDeclarer(projetId?: string) {
  return projetId ? { path: '/paiements/declarer', query: { projet: projetId } } : '/paiements/declarer'
}

/** Détail d'un projet ; contrat à signer d'abord tant qu'il ne l'est pas. */
export function lienProjet(s: Pick<SouscriptionMembre, 'projetId' | 'statut'>) {
  return s.statut === 'signature_attendue' ? `/projets/${s.projetId}/contrat` : `/projets/${s.projetId}`
}

/** Le projet est-il terminé ? (carte grisée, badge « Terminé »). */
export const estTermine = (s: SouscriptionMembre) => s.projet.statut === 'termine'

/** Statut affiché sur la carte : terminé, sinon celui de la souscription. */
export const statutCarte = (s: SouscriptionMembre): StatutSouscription | 'termine' => (estTermine(s) ? 'termine' : s.statut)

const RANG_STATUT = { en_retard: 0, signature_attendue: 1, a_jour: 2 } as const

/** Tri de l'accueil : retards, puis signatures attendues, puis prochaine échéance la plus proche. */
export function trierSouscriptions(liste: SouscriptionMembre[]): SouscriptionMembre[] {
  return [...liste].sort((a, b) => {
    const r = RANG_STATUT[a.statut] - RANG_STATUT[b.statut]
    if (r) return r
    return (a.prochaine?.date ?? '9999').localeCompare(b.prochaine?.date ?? '9999')
  })
}

/** Part de l'engagement déjà versée, en %. */
export function progression(s: Pick<SouscriptionMembre, 'verse' | 'engagement'>): number {
  return s.engagement ? Math.round((s.verse / s.engagement) * 100) : 0
}

/** L'association du projet est-elle suspendue par Cotiz ? (projet visible, aucune déclaration, 2026-11-10). */
export const estSuspendue = (s: Pick<SouscriptionMembre, 'association'>) => s.association.statut === 'suspendue'

/** Noms des associations suspendues parmi ces projets, sans doublon (bandeau de suspension). */
export function associationsSuspendues(liste: Pick<SouscriptionMembre, 'association'>[]): string[] {
  return [...new Set(liste.filter(estSuspendue).map(s => s.association.nom))]
}

/**
 * Peut-on déclarer un paiement sur ce projet ? Mêmes refus que le back (`me.declare`) : projet terminé ou archivé,
 * contrat à signer, association suspendue ; et rien à régler. Sans projet déclarable, aucun bouton « Déclarer ».
 */
export function peutDeclarer(s: {
  projet: { statut: StatutProjet }
  statut: StatutSouscription
  association: { statut: string }
  reste: number
}): boolean {
  return s.projet.statut !== 'termine' && s.statut !== 'signature_attendue' && s.association.statut !== 'suspendue' && s.reste > 0
}
