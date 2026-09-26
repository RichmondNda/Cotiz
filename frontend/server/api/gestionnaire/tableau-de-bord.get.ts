// GET /api/gestionnaire/tableau-de-bord — indicateurs de l'association du gestionnaire connecté (MgDashboard).
// Scénarios : `premier-usage` (aucun projet), `tout-est-a-jour` (rien à valider, aucun contrat en souffrance).
// Collecte du mois et taux de recouvrement : DONNEES-REFERENCE.md. Avril → août : valeurs lues sur les barres
// de la maquette (seul septembre, 1 240 000 F, est une donnée de référence).
import type { TableauDeBordGestionnaire } from '~~/types'
import { joursDepuis } from '../../../app/utils/format'
import { store } from '../../mocks/store'

const ATTENDU_MENSUEL = 1_300_000
const RECUS = [1_200_000, 1_250_000, 1_080_000, 1_000_000, 1_150_000, 1_240_000]
const MOIS = ['2026-04-01', '2026-05-01', '2026-06-01', '2026-07-01', '2026-08-01', '2026-09-01']
/** Un contrat est « en souffrance » après 7 jours sans signature. */
const DELAI_SIGNATURE_JOURS = 7

const estDate = (d?: string) => Boolean(d && /^\d{4}-\d{2}-\d{2}/.test(d))

export default defineMockHandler((event, scenario): TableauDeBordGestionnaire => {
  const moi = utilisateurSession(event)
  const association = store.associations.find(a => a.id === moi?.associationId) ?? introuvable('Association')
  const premierUsage = scenario === 'premier-usage'
  const aJour = scenario === 'tout-est-a-jour'
  const projets = premierUsage ? [] : store.projets.filter(p => p.associationId === association.id)

  const enAttente = aJour
    ? []
    : store.paiements
        .filter(p => p.associationId === association.id && p.statut === 'en_attente')
        .sort((a, b) => a.declareLe.localeCompare(b.declareLe))

  const contratsNonSignes = aJour || premierUsage
    ? []
    : store.souscriptions
        .filter(s => s.statut === 'signature_attendue' && estDate(s.inscritLe) && joursDepuis(s.inscritLe) > DELAI_SIGNATURE_JOURS)
        .flatMap((s) => {
          const projet = projets.find(p => p.id === s.projetId)
          const sc = store.souscripteurs.find(x => x.id === s.souscripteurId)
          const contrat = store.contrats.find(c => c.projetId === s.projetId && c.souscripteurId === s.souscripteurId && c.statut === 'a_signer')
          return projet && sc && contrat
            ? [{ contratId: contrat.id, souscripteurId: sc.id, nomSouscripteur: `${sc.prenom} ${sc.nom}`, projetId: projet.id, nomProjet: projet.nom }]
            : []
        })

  return {
    association: { id: association.id, nom: association.nom },
    collecteMois: { collecte: RECUS.at(-1)!, attendu: ATTENDU_MENSUEL },
    paiementsAValider: { nombre: enAttente.length, plusAncienLe: enAttente[0]?.declareLe },
    enRetard: { nombre: aJour ? 0 : projets.reduce((n, p) => n + p.nbEnRetard, 0), actifs: association.nbSouscripteurs },
    tauxRecouvrement: 82,
    nbSouscripteurs: association.nbSouscripteurs,
    nbProjets: projets.length,
    contratsNonSignes,
    collecteMensuelle: MOIS.map((mois, i) => ({ mois, attendu: ATTENDU_MENSUEL, recu: RECUS[i]!, enCours: i === MOIS.length - 1 })),
  }
})
