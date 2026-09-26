// GET /api/projets/:id/contrat — MgProjetContrat : modèle de contrat du projet (verrouillé) et suivi des signatures.
// Scénario : `tous-signes`. Le texte reprend la maquette (engagement du projet, puis clauses à définir par l'association).
import type { ContratProjet, Projet } from '~~/types'
import { estDate, formatDate, formatFCFA } from '../../../../app/utils/format'
import { store } from '../../../mocks/store'

function engagement(p: Projet, association: string): string {
  const fonds = p.fondsEntree ? `un fonds d’entrée de **${formatFCFA(p.fondsEntree)}**, puis ` : ''
  const jour = p.jourEcheance ? `, le ${p.jourEcheance} de chaque mois` : ''
  const debut = estDate(p.dateDebut) ? `, à partir du **${formatDate(p.dateDebut, 'long')}**` : ''
  const fin = estDate(p.dateFin) ? ` et jusqu’au ${formatDate(p.dateFin, 'long')}` : ''
  const nb = p.nbEcheances ? `, soit ${p.nbEcheances} échéances` : ''
  return `Je soussigné(e) **{nom_souscripteur}** m’engage à verser à l’association ${association} ${fonds}`
    + `**${formatFCFA(p.montantEcheance)}** de façon **${p.frequence}**${jour}${debut}${fin}${nb}.`
}

export default defineMockHandler((event, scenario): ContratProjet => {
  const id = parametre(event, 'id')
  const projet = projetGestionnaire(id, scenario)
  const association = store.associations.find(a => a.id === projet.associationId)!
  const total = projet.nbSouscripteurs
  const nonSignataires = scenario === 'tous-signes'
    ? []
    : souscriptionsActives(id)
        .filter(s => s.statut === 'signature_attendue')
        .map(s => ({ souscripteurId: s.souscripteurId, nom: nomSouscripteur(s.souscripteurId), inscritLe: s.inscritLe }))

  return {
    association: { nom: association.nom, ville: association.ville },
    texte: [
      engagement(projet, association.nom),
      'Les paiements sont effectués directement à l’association, par virement bancaire ou mobile money, puis déclarés dans Cotiz avec une preuve.',
      '[Clauses complémentaires définies par l’association : retard, retrait, remboursement.]',
    ].join('\n\n'),
    signataire: projet.signataire && projet.creeLe
      ? { nom: projet.signataire.nom, fonction: projet.signataire.fonction, signeLe: projet.creeLe }
      : undefined,
    signes: typeof total === 'number' ? total - projet.nbSignaturesAttendues : total,
    total,
    nonSignataires,
  }
})
