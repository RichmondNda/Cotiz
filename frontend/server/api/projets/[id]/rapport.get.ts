// GET /api/projets/:id/rapport — MgProjetRapports : situation par souscripteur, taux cumulé, répartition des statuts.
// Scénario : `graphiques-bientot-disponibles` (graphiques avancés en V2).
// Taux par échéance : valeurs lues sur la courbe de la maquette (100 % → 82 %).
import type { LigneRapport, RapportProjet } from '~~/types'
import { maintenant } from '../../../../app/utils/date-reference'
import { store } from '../../../mocks/store'

const TAUX = [100, 98, 95, 92, 89, 86, 82]

export default defineMockHandler((event, scenario): RapportProjet => {
  const id = parametre(event, 'id')
  const projet = projetGestionnaire(id, scenario)
  const aujourdhui = maintenant()

  const lignes: LigneRapport[] = souscriptionsActives(id).map((s) => {
    const echeances = echeancesProjet(id, s.souscripteurId, scenario)
    const derniers = store.paiements
      .filter(p => p.projetId === id && p.souscripteurId === s.souscripteurId && p.statut === 'valide')
      .sort((a, b) => b.declareLe.localeCompare(a.declareLe))
    const signe = s.statut !== 'signature_attendue'
    const attendu = echeances.filter(e => /^\d{4}-/.test(e.date) && new Date(e.date) <= aujourdhui).reduce((t, e) => t + e.montant, 0)
    const verse = echeances.reduce((t, e) => t + e.montantPaye, 0)
    return {
      souscripteurId: s.souscripteurId,
      nom: nomSouscripteur(s.souscripteurId),
      attenduADate: signe ? attendu : null,
      verse,
      reste: signe ? Math.max(0, attendu - verse) : null,
      retards: echeances.filter(estEnRetard).length,
      dernierPaiement: derniers[0]?.declareLe,
    }
  })

  const inscrits = typeof projet.nbSouscripteurs === 'number' ? projet.nbSouscripteurs : 0
  const debut = /^\d{4}-\d{2}-\d{2}$/.test(projet.dateDebut) ? projet.dateDebut : null
  return {
    lignes,
    tauxParEcheance: debut
      ? TAUX.map((taux, i) => ({ mois: new Date(Date.UTC(Number(debut.slice(0, 4)), Number(debut.slice(5, 7)) - 1 + i, 1)).toISOString().slice(0, 10), taux }))
      : [],
    statuts: {
      aJour: Math.max(0, inscrits - projet.nbEnRetard - projet.nbSignaturesAttendues),
      enRetard: projet.nbEnRetard,
      signature: projet.nbSignaturesAttendues,
    },
    graphiquesDisponibles: scenario !== 'graphiques-bientot-disponibles',
  }
})
