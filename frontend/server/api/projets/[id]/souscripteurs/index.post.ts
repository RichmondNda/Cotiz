// POST /api/projets/:id/souscripteurs — inscrit un souscripteur (compte existant ou nouveau compte) :
// souscription « signature attendue », contrat à signer, échéances à venir (+ échéances passées à rattraper).
import type { NouvelleInscription, Souscripteur, Souscription } from '~~/types'
import { dateEcheance } from '../../../../../app/utils/echeancier'
import { maintenant } from '../../../../../app/utils/date-reference'
import { idEcheance, rendreContrat } from '../../../../mocks/generation'
import { store } from '../../../../mocks/store'

const iso = (d: Date) => d.toISOString().slice(0, 10)

function slug(t: string): string {
  return t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export default defineMockHandler(async (event) => {
  const id = parametre(event, 'id')
  const projet = store.projets.find(p => p.id === id) ?? introuvable('Projet')
  const c = await readBody<NouvelleInscription>(event)
  const aujourdhui = iso(maintenant())

  let souscripteur: Souscripteur | undefined = c.souscripteurId ? store.souscripteurs.find(s => s.id === c.souscripteurId) : undefined
  if (!souscripteur) {
    if (!c.prenom?.trim() || !c.nom?.trim()) erreurMetier(422, 'identite_incomplete', 'Prenom et nom obligatoires')
    let sid = slug(`${c.prenom} ${c.nom}`)
    for (let i = 2; store.souscripteurs.some(s => s.id === sid); i++) sid = `${slug(`${c.prenom} ${c.nom}`)}-${i}`
    souscripteur = {
      id: sid, prenom: c.prenom!.trim(), nom: c.nom!.trim(), telephone: `+225 ${chiffresTel(c.telephone).replace(/(\d{2})(?=\d)/g, '$1 ')}`,
      email: c.email || undefined, adresse: c.adresse || undefined, associationIds: [projet.associationId], membreDepuis: aujourdhui,
    }
    store.souscripteurs.push(souscripteur)
  }
  else if (!souscripteur.associationIds.includes(projet.associationId)) {
    souscripteur.associationIds.push(projet.associationId)
  }
  if (souscriptionsActives(id).some(s => s.souscripteurId === souscripteur!.id)) erreurMetier(409, 'deja_inscrit', 'Deja inscrit')

  const engagement = projet.engagementParSouscripteur ?? 0
  const contratId = `ct-${souscripteur.id}-${id}`
  const souscription: Souscription = {
    id: `sc-${souscripteur.id}-${id}`, souscripteurId: souscripteur.id, projetId: id, inscritLe: c.dateEntree ?? aujourdhui,
    contratId, verse: 0, reste: engagement, engagement, statut: 'signature_attendue', montantEnRetard: 0,
  }
  store.souscriptions.push(souscription)

  // Échéances : à venir, plus celles déjà échues que le gestionnaire a choisi de faire rattraper.
  if (/^\d{4}-\d{2}-\d{2}$/.test(projet.dateDebut) && projet.nbEcheances) {
    const rattrapage = new Set(c.rattrapage ?? [])
    const total = (projet.fondsEntree ? 1 : 0) + projet.nbEcheances
    for (let rang = 0; rang < total; rang++) {
      const estFondsEntree = Boolean(projet.fondsEntree) && rang === 0
      const n = projet.fondsEntree ? Math.max(0, rang - 1) : rang
      const date = estFondsEntree ? aujourdhui : dateEcheance(projet.dateDebut, projet.frequence, n, projet.jourEcheance)!
      if (!estFondsEntree && date < aujourdhui && !rattrapage.has(rang)) continue
      if (estFondsEntree && !rattrapage.has(0) && c.rattrapage) continue
      store.echeances.push({
        id: idEcheance(id, souscripteur.id, rang), projetId: id, souscripteurId: souscripteur.id, rang, estFondsEntree,
        date, montant: estFondsEntree ? projet.fondsEntree! : projet.montantEcheance, montantPaye: 0, statut: 'a_venir',
      })
    }
  }

  const association = store.associations.find(a => a.id === projet.associationId)!
  store.contrats.push({
    id: contratId, projetId: id, souscripteurId: souscripteur.id, associationId: projet.associationId,
    texte: rendreContrat(projet, association, souscripteur), engagement, statut: 'a_signer', envoyeLe: aujourdhui,
    signeParAssociationLe: '[DATE]', signataireAssociation: projet.signataire ? `${projet.signataire.nom}, ${projet.signataire.fonction.toLowerCase()}` : '[SIGNATAIRE]',
  })
  if (typeof projet.nbSouscripteurs === 'number') projet.nbSouscripteurs += 1
  projet.nbSignaturesAttendues += 1
  setResponseStatus(event, 201)
  return { ...souscription, souscripteur }
})
