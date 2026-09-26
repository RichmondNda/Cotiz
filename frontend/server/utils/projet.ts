// Vues gestionnaire d'un projet (détail, synthèse, grille, rapports), calculées depuis le store en mémoire
// (auto-importées par Nitro). Les scénarios de l'inventaire s'appliquent à des copies, jamais au store.
//   - `aucun-retard` : plus aucun retard, collecte à 100 % à date ;
//   - `termine` : projet clos, tout collecté ;
//   - `beaucoup-de-retards` : grille de MgProjetPaiements avec Kadiatou et Serge en retard.
import type { Echeance, Projet, Retardataire, Souscription } from '~~/types'
import { maintenant } from '../../app/utils/date-reference'
import { store } from '../mocks/store'

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

/** Projet (copie) avec le scénario appliqué, sinon 404. */
export function projetGestionnaire(id: string, scenario?: string): Projet {
  const p = store.projets.find(x => x.id === id) ?? introuvable('Projet')
  const engagement = p.engagementParSouscripteur ?? 0
  const inscrits = typeof p.nbSouscripteurs === 'number' ? p.nbSouscripteurs : 0
  switch (scenario) {
    case 'aucun-retard':
      return { ...p, nbEnRetard: 0, montantCollecte: p.montantAttenduADate, tauxRecouvrement: 100 }
    case 'termine':
      return {
        ...p, statut: 'termine', nbEnRetard: 0, tauxRecouvrement: 100, avancement: 100,
        montantCollecte: engagement * inscrits, montantAttenduADate: engagement * inscrits,
      }
    case 'tous-signes':
      return { ...p, nbSignaturesAttendues: 0 }
    default:
      return { ...p }
  }
}

/** Séquences de la maquette pour l'état « beaucoup de retards » (MgProjetPaiements). */
const SEQUENCES_RETARDS: Record<string, string> = {
  'kadiatou-sanogo': 'oooolllW',
  'serge-gnagne': 'ooooollW',
}
const CODES: Record<string, Echeance['statut']> = { o: 'payee', l: 'en_retard', W: 'declaree' }

/** Échéances d'un souscripteur sur un projet (copies), scénario appliqué. */
export function echeancesProjet(projetId: string, souscripteurId: string, scenario?: string): Echeance[] {
  const liste = store.echeances
    .filter(e => e.projetId === projetId && e.souscripteurId === souscripteurId)
    .sort((a, b) => a.rang - b.rang)
    .map(e => ({ ...e }))
  const seq = scenario === 'beaucoup-de-retards' ? SEQUENCES_RETARDS[souscripteurId] : undefined
  if (seq) {
    for (const e of liste) {
      const statut = CODES[seq[e.rang] ?? '']
      if (statut) Object.assign(e, { statut, montantPaye: statut === 'payee' ? e.montant : 0 })
    }
  }
  if (scenario === 'aucun-retard' || scenario === 'termine') {
    for (const e of liste) {
      if (e.statut === 'en_retard' || e.statut === 'partielle') Object.assign(e, { statut: 'payee', montantPaye: e.montant })
    }
  }
  return liste
}

/** Échéance non réglée dont la date est passée : en retard, ou partielle échue (solde restant dû). */
export function estEnRetard(e: Echeance): boolean {
  if (e.statut === 'en_retard') return true
  return e.statut === 'partielle' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && new Date(e.date) < maintenant()
}

/** Souscriptions actives (non retirées) d'un projet. */
export function souscriptionsActives(projetId: string): Souscription[] {
  return store.souscriptions.filter(s => s.projetId === projetId && !s.retireLe)
}

export function nomSouscripteur(id: string): string {
  const s = store.souscripteurs.find(x => x.id === id)
  return s ? `${s.prenom} ${s.nom}` : id
}

/** Retardataires d'un projet, du plus gros montant dû au plus petit. */
export function retardatairesProjet(projetId: string, scenario?: string): Retardataire[] {
  return souscriptionsActives(projetId)
    .flatMap((s) => {
      const retards = echeancesProjet(projetId, s.souscripteurId, scenario).filter(estEnRetard)
      if (!retards.length) return []
      return [{
        souscripteurId: s.souscripteurId,
        nom: nomSouscripteur(s.souscripteurId),
        nbEcheances: retards.length,
        montant: retards.reduce((t, e) => t + e.montant - e.montantPaye, 0),
        mois: retards.map(e => (e.estFondsEntree ? 'fonds d’entrée' : MOIS[new Date(e.date).getMonth()]!)),
      }]
    })
    .sort((a, b) => b.montant - a.montant || b.nbEcheances - a.nbEcheances)
}

/**
 * Recalcule versé, reste, retard et statut d'une souscription d'après ses échéances (après une validation).
 * Ajuste les compteurs dénormalisés du projet (souscripteurs en retard) si le statut change.
 */
export function actualiserSouscriptionProjet(s: Souscription) {
  const echeances = store.echeances.filter(e => e.projetId === s.projetId && e.souscripteurId === s.souscripteurId)
  if (!echeances.length) return
  const avant = s.statut
  s.verse = echeances.reduce((t, e) => t + e.montantPaye, 0)
  s.reste = Math.max(0, s.engagement - s.verse)
  const retards = echeances.filter(estEnRetard)
  s.montantEnRetard = retards.reduce((t, e) => t + e.montant - e.montantPaye, 0)
  if (s.statut !== 'signature_attendue') s.statut = retards.length ? 'en_retard' : 'a_jour'
  const projet = store.projets.find(p => p.id === s.projetId)
  if (projet && avant !== s.statut) {
    if (avant === 'en_retard') projet.nbEnRetard = Math.max(0, projet.nbEnRetard - 1)
    if (s.statut === 'en_retard') projet.nbEnRetard += 1
  }
}

/** Chiffres seuls d'un téléphone saisi (`+225 05 44 21 87 90` → `0544218790`). */
export function chiffresTel(tel: string): string {
  const c = tel.replace(/\D/g, '')
  return c.startsWith('225') && c.length === 13 ? c.slice(3) : c
}
