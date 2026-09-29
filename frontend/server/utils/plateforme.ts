// Espace plateforme (super-admin) : assemblage des réponses à partir du store en mémoire.
import type {
  Association,
  AssociationListe,
  DemandeDetaillee,
  Demande,
  EvenementDemande,
  FicheAssociationPlateforme,
  ModificationPlan,
  Quota,
  QuotaUtilise,
  TypeAssociation,
} from '~~/types'
import { store } from '../mocks/store'
import { superadmin } from '../mocks/referentiel'
import { FICHES_ASSOCIATIONS, INITIALES_PLATEFORME, PROCHAINE_ECHEANCE_ABONNEMENT } from '../mocks/plateforme'

/** Identifiant lisible tiré d'un nom (« Tontine des commerçantes » → `tontine-des-commercantes`), unique dans `existants`. */
export function slugUnique(nom: string, existants: string[], defaut = 'element'): string {
  const base = nom.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || defaut
  let id = base
  for (let i = 2; existants.includes(id); i++) id = `${base}-${i}`
  return id
}

/** Initiales d'un nom d'association (« Jeunesse solidaire de Bouaké » → « JS »), mots de liaison ignorés. */
export function sigleAssociation(nom: string): string {
  const mots = nom.split(/[\s’']+/).filter(m => m.length > 2 && !['des', 'les', 'pour', 'association'].includes(m.toLowerCase()))
  return (mots.slice(0, 2).map(m => m.charAt(0)).join('') || nom.slice(0, 2)).toUpperCase()
}

// ---------------------------------------------------------------- Demandes
/** Frise d'une demande : reçue, consultée par Richy, décision. */
export function historiqueDemande(d: Demande): EvenementDemande[] {
  const evts: EvenementDemande[] = [{ id: 'recue', titre: 'Demande reçue', date: d.recueLe, ton: 'info' }]
  if (d.consulteeLe) evts.push({ id: 'consultee', titre: `Consultée par ${superadmin.prenom}`, date: d.consulteeLe, ton: 'brand' })
  const planAttribue = store.plans.find(p => p.id === d.planAttribueId)?.nom
  if (d.statut === 'approuvee' && d.decideLe) {
    evts.push({ id: 'decision', titre: 'Approuvée — espace créé', date: d.decideLe, detail: [`par ${superadmin.prenom}`, planAttribue && `plan ${planAttribue}`].filter(Boolean).join(' · '), ton: 'success' })
  }
  if (d.statut === 'refusee' && d.decideLe) {
    evts.push({ id: 'decision', titre: 'Refusée', date: d.decideLe, detail: [`par ${superadmin.prenom}`, d.motifRefus].filter(Boolean).join(' · '), ton: 'danger' })
  }
  return evts
}

export const demandeDetaillee = (d: Demande): DemandeDetaillee => ({ ...d, historique: historiqueDemande(d) })

// ---------------------------------------------------------------- Associations
/** Association telle que vue par la plateforme (initiales de la maquette super-admin). */
const vuePlateforme = (a: Association): Association => ({ ...a, sigle: INITIALES_PLATEFORME[a.id] ?? a.sigle })

export function associationListe(a: Association): AssociationListe {
  return {
    ...vuePlateforme(a),
    planNom: store.plans.find(p => p.id === a.planId)?.nom ?? a.planId,
    derniereActivite: store.derniereActivite[a.id] ?? a.creeeLe,
  }
}

function quota(utilise: number, limite: Quota): QuotaUtilise {
  return { utilise, limite, pourcentage: typeof limite === 'number' && limite > 0 ? Math.min(100, Math.round(utilise / limite * 100)) : 0 }
}

/** Fiche plateforme d'une association : détail de référence si connu, sinon construit depuis le store (associations créées). */
export function ficheAssociation(a: Association): FicheAssociationPlateforme {
  const plan = store.plans.find(p => p.id === a.planId) ?? store.plans[0]!
  const reference = FICHES_ASSOCIATIONS[a.id]
  const suspension = store.suspensions[a.id]
  const commun = {
    association: vuePlateforme(a),
    plan,
    abonnement: { prixMensuel: plan.prixMensuel, prochaineEcheance: a.abonnementProchaineEcheance && a.abonnementProchaineEcheance !== '[DATE]' ? a.abonnementProchaineEcheance : PROCHAINE_ECHEANCE_ABONNEMENT },
    ...(a.statut === 'suspendue' ? { suspendueLe: suspension?.le ?? '2026-09-25' } : {}),
  }
  if (reference) {
    const { impaye, ...reste } = reference
    return { ...reste, ...commun, ...(a.statut === 'impayee' && impaye ? { impaye } : {}) }
  }
  const principal = store.gestionnaires.find(g => g.associationId === a.id && g.role === 'principal')
  const nomContact = principal ? `${principal.prenom} ${principal.nom}`.trim() : '[Responsable]'
  return {
    ...commun,
    contact: {
      nom: nomContact,
      initiales: principal ? `${principal.prenom.charAt(0)}${principal.nom.charAt(0)}`.toUpperCase() : '··',
      role: 'Gestionnaire principal',
      email: principal?.email ?? '[email]',
      telephone: principal?.telephone ?? '+225 [XX XX XX XX XX]',
    },
    kpi: { projetsActifs: a.nbProjets, souscripteurs: a.nbSouscripteurs, collecteCumule: 0, tauxRecouvrement: null },
    quotas: {
      projets: quota(a.nbProjets, plan.quotas.projets),
      souscripteurs: quota(a.nbSouscripteurs, plan.quotas.souscripteurs),
      gestionnaires: quota(a.nbGestionnaires, (a.limiteComptesSecondaires ?? 0) + 1),
    },
    evenements: [
      { id: 'ev-cree', titre: 'Espace créé', detail: `${a.creeeLe.split('-').reverse().join('/')} · par ${superadmin.prenom}`, ton: 'success' },
    ],
    projets: [],
    souscripteurs: [],
    factures: [{ id: `f-${a.id}`, periode: PROCHAINE_ECHEANCE_ABONNEMENT, montant: plan.prixMensuel, statut: 'a_venir' }],
  }
}

/** Crée une association et son gestionnaire principal dans le store (approbation d'une demande, création directe). */
export function creerAssociation(donnees: {
  nom: string
  type: TypeAssociation
  ville: string
  pays: string
  description?: string
  numeroEnregistrement?: string
  planId: string
  debut: string
  comptesGestionnaires: number
  gestionnaire: { prenom: string, nom: string, email: string, telephone: string, fonction?: string }
  creeeLe: string
}): Association {
  const id = slugUnique(donnees.nom, store.associations.map(a => a.id), 'association')
  const association: Association = {
    id,
    nom: donnees.nom,
    sigle: sigleAssociation(donnees.nom),
    type: donnees.type,
    ville: donnees.ville,
    pays: donnees.pays,
    ...(donnees.description ? { description: donnees.description } : {}),
    ...(donnees.numeroEnregistrement ? { numeroEnregistrement: donnees.numeroEnregistrement } : {}),
    emailContact: donnees.gestionnaire.email,
    telephoneContact: donnees.gestionnaire.telephone,
    statut: 'onboarding',
    planId: donnees.planId,
    abonnementProchaineEcheance: donnees.debut,
    modalitesPaiement: [],
    nbProjets: 0,
    nbSouscripteurs: 0,
    nbGestionnaires: 1,
    limiteComptesSecondaires: donnees.comptesGestionnaires,
    creeeLe: donnees.creeeLe,
  }
  store.associations.push(association)
  store.gestionnaires.push({
    id: slugUnique(`${donnees.gestionnaire.prenom}-${donnees.gestionnaire.nom}`, store.gestionnaires.map(g => g.id), 'gestionnaire'),
    associationId: id,
    prenom: donnees.gestionnaire.prenom,
    nom: donnees.gestionnaire.nom,
    ...(donnees.gestionnaire.fonction ? { fonction: donnees.gestionnaire.fonction } : {}),
    email: donnees.gestionnaire.email,
    telephone: donnees.gestionnaire.telephone,
    role: 'principal',
    statut: 'invite',
    derniereConnexion: null,
  })
  store.derniereActivite[id] = donnees.creeeLe
  return association
}

// ---------------------------------------------------------------- Plans
/** Contrôle le corps d'une création ou modification de plan ; renvoie les champs à enregistrer. */
export function planValide(corps: ModificationPlan | undefined): ModificationPlan {
  const prix = (p: unknown) => p === '[PRIX]' || (typeof p === 'number' && p >= 0 && Number.isInteger(p))
  const quota = (q: unknown) => q === null || q === '[N]' || (typeof q === 'number' && q >= 1)
  const q = corps?.quotas
  if (!corps?.nom?.trim() || !prix(corps.prixMensuel) || !prix(corps.prixAnnuel)
    || !q || !quota(q.projets) || !quota(q.souscripteurs) || !quota(q.gestionnaires)
    || !Array.isArray(corps.fonctionnalites) || (corps.statut !== 'actif' && corps.statut !== 'archive')) {
    throw createError({ statusCode: 400, statusMessage: 'Plan incomplet' })
  }
  return {
    nom: corps.nom.trim(),
    ...(corps.description?.trim() ? { description: corps.description.trim() } : {}),
    prixMensuel: corps.prixMensuel,
    prixAnnuel: corps.prixAnnuel,
    quotas: { projets: q.projets, souscripteurs: q.souscripteurs, gestionnaires: q.gestionnaires },
    fonctionnalites: corps.fonctionnalites,
    misEnAvant: Boolean(corps.misEnAvant) && corps.statut === 'actif',
    statut: corps.statut,
  }
}
