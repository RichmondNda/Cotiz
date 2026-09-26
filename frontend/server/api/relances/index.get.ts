// GET /api/relances — relances de l'association du gestionnaire (MgRelances) : retardataires de ses projets (échéances
// en retard, montant dû, retard depuis, dernière relance), indicateurs, règles automatiques, historique des envois.
// Scénario : `aucun-retard`.
import type { LigneRetard, Relances } from '~~/types'
import { store } from '../../mocks/store'

export default defineMockHandler((event, scenario): Relances => {
  const associationId = utilisateurSession(event)?.associationId ?? 'entraide-yopougon'
  const association = store.associations.find(a => a.id === associationId) ?? introuvable('Association')
  const projets = store.projets.filter(p => p.associationId === associationId)

  const retardataires: LigneRetard[] = scenario === 'aucun-retard'
    ? []
    : projets.flatMap(projet => souscriptionsActives(projet.id).flatMap((s) => {
        const retards = echeancesProjet(projet.id, s.souscripteurId).filter(estEnRetard)
        if (!retards.length) return []
        const sc = store.souscripteurs.find(x => x.id === s.souscripteurId)!
        return [{
          souscripteurId: sc.id,
          nom: `${sc.prenom} ${sc.nom}`,
          telephone: sc.telephone,
          projetId: projet.id,
          nomProjet: projet.nom,
          echeances: retards.map(e => ({ date: e.date, partielle: e.statut === 'partielle' })),
          montant: retards.reduce((t, e) => t + e.montant - e.montantPaye, 0),
          retardDepuis: retards[0]!.date,
          derniereRelance: store.dernieresRelances[sc.id],
        }]
      }))
        .sort((a, b) => a.retardDepuis.localeCompare(b.retardDepuis) || b.montant - a.montant)

  const nbEnRetard = scenario === 'aucun-retard' ? 0 : projets.reduce((n, p) => n + p.nbEnRetard, 0)
  const auto = store.envoisRelance.find(e => e.type === 'automatique' && typeof e.destinataires === 'number')
  return {
    retardataires,
    nbEnRetard,
    nbActifs: association.nbSouscripteurs,
    montantEnRetard: '[MONTANT]',
    derniereAuto: auto && typeof auto.destinataires === 'number'
      ? { date: auto.date, regle: '15 jours de retard', envois: auto.destinataires }
      : undefined,
    regles: store.reglesRelance,
    historique: store.envoisRelance,
  }
})
