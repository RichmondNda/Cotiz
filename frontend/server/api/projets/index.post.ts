// POST /api/projets — création d'un projet (MgNouveauProjet) dans l'association du gestionnaire connecté.
// Projet créé : « Inscriptions ouvertes » (ou « Brouillon » si enregistré comme tel), sans souscripteur.
import type { NouveauProjet, Projet } from '~~/types'
import { nbEcheancesEntre, totalParSouscripteur } from '../../../app/utils/echeancier'
import { store } from '../../mocks/store'

function slug(nom: string): string {
  return nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'projet'
}

export default defineMockHandler(async (event) => {
  const moi = utilisateurSession(event)
  if (!moi?.associationId) throw createError({ statusCode: 403, statusMessage: 'Reserve aux gestionnaires' })
  const c = await readBody<NouveauProjet>(event)
  if (!c.brouillon) {
    if (!c.nom?.trim() || !(c.montantEcheance > 0) || !c.dateDebut) erreurMetier(422, 'projet_incomplet', 'Projet incomplet')
    if (!c.contratSigne) erreurMetier(422, 'contrat_non_signe', 'Contrat non signe')
  }

  let id = slug(c.nom)
  for (let i = 2; store.projets.some(p => p.id === id); i++) id = `${slug(c.nom)}-${i}`

  const nbEcheances = c.typeCalendrier === 'dates_fixes' && c.dateFin ? nbEcheancesEntre(c.dateDebut, c.dateFin, c.frequence) : null
  const projet: Projet = {
    id,
    associationId: moi.associationId,
    nom: c.nom.trim(),
    description: c.description,
    statut: c.brouillon ? 'brouillon' : 'inscriptions_ouvertes',
    fondsEntree: c.fondsEntree,
    montantEcheance: c.montantEcheance,
    frequence: c.frequence,
    jourEcheance: c.jourEcheance,
    typeCalendrier: c.typeCalendrier,
    dateDebut: c.dateDebut,
    dateFin: c.typeCalendrier === 'dates_fixes' ? c.dateFin : undefined,
    nbEcheances: nbEcheances ?? undefined,
    delaiGraceJours: c.delaiGraceJours,
    souscripteursRequis: c.souscripteursRequis,
    modalitesPaiement: c.modalitesPaiement,
    instructionsPaiement: c.instructionsPaiement,
    contratModele: c.contratModele,
    signataire: c.signataire,
    nbSouscripteurs: 0,
    montantCollecte: 0,
    montantAttenduADate: 0,
    tauxRecouvrement: 0,
    avancement: 0,
    nbEnRetard: 0,
    nbSignaturesAttendues: 0,
    nbPaiementsAValider: 0,
    prochaineEcheance: c.dateDebut,
    engagementParSouscripteur: totalParSouscripteur(c.fondsEntree, c.montantEcheance, nbEcheances) ?? undefined,
    creeLe: new Date().toISOString(),
  }
  store.projets.push(projet)
  const association = store.associations.find(a => a.id === moi.associationId)
  if (association) association.nbProjets += 1
  setResponseStatus(event, 201)
  return projet
})
