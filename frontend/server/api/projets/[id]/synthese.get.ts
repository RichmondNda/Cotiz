// GET /api/projets/:id/synthese — vue d'ensemble gestionnaire (MgProjet) : retardataires, points à traiter,
// collecte par échéance. Scénarios : `aucun-retard`, `termine`.
// Collecte : attendu = souscripteurs × échéance ; reçu des 7 premiers mois lu sur les barres de la maquette.
import type { SyntheseProjet } from '~~/types'
import { store } from '../../../mocks/store'

const RATIOS_RECUS = [0.99, 0.97, 0.9, 0.86, 0.83, 0.8, 0.95]

function ajouterMois(iso: string, n: number): string {
  const [a, m] = iso.split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(a, m - 1 + n, 1))
  return d.toISOString().slice(0, 10)
}

export default defineMockHandler((event, scenario): SyntheseProjet => {
  const id = parametre(event, 'id')
  const projet = projetGestionnaire(id, scenario)
  const inscrits = typeof projet.nbSouscripteurs === 'number' ? projet.nbSouscripteurs : 0

  const enAttente = store.paiements
    .filter(p => p.projetId === id && p.statut === 'en_attente')
    .sort((a, b) => a.declareLe.localeCompare(b.declareLe))

  const datee = /^\d{4}-\d{2}-\d{2}$/.test(projet.dateDebut)
  const collecte = datee && projet.nbEcheances && projet.statut !== 'inscriptions_ouvertes'
    ? Array.from({ length: projet.nbEcheances }, (_, i) => {
        const attendu = inscrits * projet.montantEcheance
        const ratio = projet.statut === 'termine' ? 1 : scenario === 'aucun-retard' ? (i < RATIOS_RECUS.length ? 1 : 0) : (RATIOS_RECUS[i] ?? 0)
        return { mois: ajouterMois(projet.dateDebut, i), attendu, recu: Math.round(attendu * ratio), enCours: projet.statut !== 'termine' && i === RATIOS_RECUS.length - 1 }
      })
    : []

  return {
    retardataires: retardatairesProjet(id, scenario),
    paiementsAValider: { nombre: enAttente.length, plusAncienLe: enAttente[0]?.declareLe },
    contratsNonSignes: souscriptionsActives(id)
      .filter(s => s.statut === 'signature_attendue')
      .map(s => ({ souscripteurId: s.souscripteurId, nom: nomSouscripteur(s.souscripteurId), inscritLe: s.inscritLe })),
    collecte,
  }
})
