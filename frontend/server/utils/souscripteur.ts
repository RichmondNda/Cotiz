// Vues de l'espace souscripteur (`/api/moi/...`), calculées depuis le store en mémoire (auto-importées par Nitro).
// Les scénarios de l'inventaire (MbAccueil, MbProjet) s'appliquent à une copie des données de Moussa Diarra,
// jamais au store lui-même : ils forcent un état d'écran sans perturber les mutations réelles.
import type { H3Event } from 'h3'
import type {
  AssociationMembre,
  Echeance,
  Paiement,
  Projet,
  SituationSouscription,
  Souscription,
  SouscriptionMembre,
  UtilisateurSession,
} from '~~/types'
import { idEcheance } from '../mocks/generation'
import { store } from '../mocks/store'

/** Souscripteur connecté, sinon 403. */
export function souscripteurSession(event: H3Event): UtilisateurSession {
  const moi = utilisateurSession(event)
  if (moi?.role !== 'souscripteur') throw createError({ statusCode: 403, statusMessage: 'Réservé aux souscripteurs' })
  return moi
}

interface DonneesMembre {
  souscriptions: Souscription[]
  projets: Projet[]
  echeances: Echeance[]
  paiements: Paiement[]
}

const CENTRE = 'centre-communautaire'

/** Paiement de Moussa ajouté par un scénario (août et septembre de Centre communautaire, 50 000 F). */
function paiementScenario(moiId: string, statut: Paiement['statut'], declareLe: string): Paiement {
  return {
    id: `pm-scenario-${statut}`, souscripteurId: moiId, projetId: CENTRE, associationId: 'entraide-yopougon',
    montant: 50000, moyen: 'mobile_money', declareLe,
    preuve: { type: 'reference', reference: '[RÉFÉRENCE]' },
    repartition: [6, 7].map(rang => ({ echeanceId: idEcheance(CENTRE, moiId, rang), montantAffecte: 25000 })),
    repartitionAjustee: false, statut,
    ...(statut === 'rejete' ? { traiteLe: '2026-09-22', motifRejet: 'preuve_illisible' as const } : {}),
    ...(statut === 'valide' ? { traiteLe: '2026-09-21' } : {}),
  }
}

/**
 * Données du souscripteur, avec le scénario appliqué :
 * - `tout-est-paye` (MbAccueil) / `a-jour` (MbProjet) : août et septembre de Centre payés (50 000 F le 20/09) ;
 *   `tout-est-paye` retire aussi Voyage solidaire, comme la maquette ;
 * - `paiement-en-attente` : août et septembre déclarés le 25/09, en attente de validation ;
 * - `paiement-rejete` : déclaration du 20/09 rejetée (preuve illisible), retard inchangé ;
 * - `termine` : Centre communautaire terminé, toutes les échéances payées.
 */
export function donneesMembre(moiId: string, scenario: string | undefined): DonneesMembre {
  const d: DonneesMembre = structuredClone({
    souscriptions: store.souscriptions.filter(s => s.souscripteurId === moiId),
    projets: store.projets,
    echeances: store.echeances.filter(e => e.souscripteurId === moiId),
    paiements: store.paiements.filter(p => p.souscripteurId === moiId),
  })
  const centre = d.souscriptions.find(s => s.projetId === CENTRE)
  const echeancesCentre = d.echeances.filter(e => e.projetId === CENTRE)
  const passer = (rangs: number[], statut: Echeance['statut']) => echeancesCentre
    .filter(e => rangs.includes(e.rang))
    .forEach((e) => {
      e.statut = statut
      e.montantPaye = statut === 'payee' ? e.montant : 0
    })

  switch (scenario) {
    case 'aucun-projet':
      return { ...d, souscriptions: [] }
    case 'tout-est-paye':
    case 'a-jour':
      passer([6, 7], 'payee')
      d.paiements.push(paiementScenario(moiId, 'valide', '2026-09-20'))
      if (scenario === 'tout-est-paye') d.souscriptions = d.souscriptions.filter(s => s.statut !== 'signature_attendue')
      break
    case 'paiement-en-attente':
      passer([6, 7], 'declaree')
      d.paiements.push(paiementScenario(moiId, 'en_attente', '2026-09-25'))
      break
    case 'paiement-rejete':
      d.paiements.push(paiementScenario(moiId, 'rejete', '2026-09-20'))
      break
    case 'termine': {
      passer(echeancesCentre.map(e => e.rang), 'payee')
      const projet = d.projets.find(p => p.id === CENTRE)
      if (projet) projet.statut = 'termine'
      break
    }
  }
  if (centre) recalculerSouscription(centre, d.echeances.filter(e => e.projetId === CENTRE))
  d.paiements.sort((a, b) => b.declareLe.localeCompare(a.declareLe))
  return d
}

/**
 * Versé, reste, retard et statut d'une souscription d'après ses échéances (après une déclaration ou un scénario).
 * Sans échéances (projet sans calendrier daté), la souscription est laissée telle quelle.
 */
export function recalculerSouscription(s: Souscription, echeances: Echeance[]) {
  if (!echeances.length) return
  s.verse = echeances.reduce((t, e) => t + e.montantPaye, 0)
  s.reste = Math.max(0, s.engagement - s.verse)
  s.montantEnRetard = echeances.filter(e => e.statut === 'en_retard').reduce((t, e) => t + e.montant - e.montantPaye, 0)
  if (!s.contratSigneLe) s.statut = 'signature_attendue'
  else s.statut = s.montantEnRetard > 0 ? 'en_retard' : 'a_jour'
}

/** Retards et prochaine échéance d'une souscription. */
export function situation(echeances: Echeance[]): SituationSouscription {
  const tri = [...echeances].sort((a, b) => a.rang - b.rang)
  const retards = tri.filter(e => e.statut === 'en_retard')
  const prochaine = tri.find(e => e.statut === 'a_venir')
  return {
    nbEcheancesEnRetard: retards.length,
    ...(retards[0] ? { retardDepuis: retards[0].date } : {}),
    ...(prochaine ? { prochaine: { date: prochaine.date, montant: prochaine.montant - prochaine.montantPaye } } : {}),
  }
}

/** Souscriptions enrichies (projet, association, situation). */
export function souscriptionsMembre(d: DonneesMembre): SouscriptionMembre[] {
  return d.souscriptions.map((s) => {
    const projet = d.projets.find(p => p.id === s.projetId)!
    return {
      ...s,
      projet,
      association: store.associations.find(a => a.id === projet.associationId)!,
      ...situation(d.echeances.filter(e => e.projetId === s.projetId)),
    }
  })
}

/** Regroupe les souscriptions par association, dans l'ordre de la première inscription. */
export function associationsMembre(souscriptions: SouscriptionMembre[]): AssociationMembre[] {
  const groupes = new Map<string, AssociationMembre>()
  const tri = [...souscriptions].sort((a, b) => a.inscritLe.localeCompare(b.inscritLe))
  for (const s of tri) {
    const g = groupes.get(s.association.id)
    if (g) g.souscriptions.push(s)
    else groupes.set(s.association.id, { association: s.association, membreDepuis: s.inscritLe, souscriptions: [s] })
  }
  return [...groupes.values()]
}
