// GET /api/gestionnaire/contrats — un contrat par projet de l'association (MgContrats) : conditions, signature de
// l'association, contre-signatures des souscripteurs, non-signataires. Scénario : `aucun-contrat`.
import type { Projet, SyntheseContratProjet } from '~~/types'
import { estDate, formatFCFA, formatMois } from '../../../app/utils/format'
import { maintenant } from '../../../app/utils/date-reference'
import { store } from '../../mocks/store'

const PAR: Record<Projet['frequence'], string> = {
  hebdomadaire: 'par semaine', mensuelle: 'par mois', trimestrielle: 'par trimestre', semestrielle: 'par semestre', annuelle: 'par an',
}

function conditions(p: Projet): string {
  const echeance = `${formatFCFA(p.montantEcheance)} ${PAR[p.frequence]}`
  if (p.typeCalendrier === 'cycle_roulant') {
    return `Cycle roulant · ${echeance}${estDate(p.dateDebut) ? ` à partir de ${formatMois(p.dateDebut).toLowerCase()}` : ''}.`
  }
  const total = p.engagementParSouscripteur ?? (p.fondsEntree ?? 0) + (p.nbEcheances ?? 0) * p.montantEcheance
  const entree = p.fondsEntree ? `${formatFCFA(p.fondsEntree)} à l’entrée, puis ` : ''
  const duree = p.nbEcheances ? ` pendant ${p.nbEcheances} mois` : ''
  return `${entree}${echeance}${duree}. Total : ${formatFCFA(total)}.`
}

export default defineMockHandler((event, scenario): SyntheseContratProjet[] => {
  if (scenario === 'aucun-contrat') return []
  const associationId = utilisateurSession(event)?.associationId ?? 'entraide-yopougon'
  const principal = store.gestionnaires.find(g => g.associationId === associationId && g.role === 'principal')
  const aujourdhui = maintenant().toISOString().slice(0, 10)
  return store.projets
    .filter(p => p.associationId === associationId && (p.statut === 'en_cours' || p.statut === 'inscriptions_ouvertes'))
    .sort((a, b) => Number(a.statut !== 'en_cours') - Number(b.statut !== 'en_cours'))
    .map((p) => {
      const contrats = store.contrats.filter(c => c.projetId === p.id)
      const signeLe = p.creeLe ?? contrats.map(c => c.signeParAssociationLe).find(estDate) ?? '[DATE]'
      const ouvert = p.statut === 'inscriptions_ouvertes'
      const total = p.nbSouscripteurs
      const nonSignataires = contrats
        .filter(c => c.statut === 'a_signer')
        .map((c) => {
          const s = store.souscripteurs.find(x => x.id === c.souscripteurId)!
          return { souscripteurId: s.id, nom: `${s.prenom} ${s.nom}`, inviteLe: c.envoyeLe }
        })
      return {
        projetId: p.id,
        nomProjet: p.nom,
        conditions: conditions(p),
        signeParAssociation: { nom: p.signataire?.nom ?? (principal ? `${principal.prenom} ${principal.nom}` : '[SIGNATAIRE]'), le: signeLe },
        signes: typeof total === 'number' ? total - p.nbSignaturesAttendues : total,
        total,
        ...(ouvert && p.souscripteursRequis ? { places: p.souscripteursRequis } : {}),
        enAttente: ouvert ? null : typeof total === 'number' ? p.nbSignaturesAttendues : '[N]',
        statut: ouvert ? 'inscriptions_ouvertes' : estDate(p.dateDebut) && p.dateDebut <= aujourdhui ? 'actif' : 'signatures_en_cours',
        nonSignataires,
      }
    })
})
