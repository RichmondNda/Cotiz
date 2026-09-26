// Vues des paiements déclarés (file de validation, détail) et mutations du gestionnaire (valider, rejeter, annuler),
// calculées depuis le store en mémoire (auto-importées par Nitro).
import type { Echeance, Paiement, PaiementListe, Projet, RepartitionEcheance, VersementValide } from '~~/types'
import { maintenant } from '../../app/utils/date-reference'
import { store } from '../mocks/store'

const MOIS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre']

export function nomGestionnaire(id?: string): string | undefined {
  const g = id ? store.gestionnaires.find(x => x.id === id) : undefined
  return g ? `${g.prenom} ${g.nom}`.trim() : undefined
}

/**
 * Échéance désignée par une répartition. Voyage solidaire n'a pas de calendrier daté dans la maquette :
 * ses échéances sont désignées par leur mois (`…:septembre-2026`) ou `…:fonds-entree` et reconstruites ici.
 */
function echeanceRepartition(p: Paiement, r: RepartitionEcheance, projet?: Projet): Echeance | undefined {
  const e = store.echeances.find(x => x.id === r.echeanceId)
  if (e) return e
  const cle = r.echeanceId.split(':').at(-1) ?? ''
  const statut = p.statut === 'valide' ? 'payee' : p.statut === 'en_attente' ? 'declaree' : 'a_venir'
  const base = { id: r.echeanceId, projetId: p.projetId, souscripteurId: p.souscripteurId, montantPaye: statut === 'payee' ? r.montantAffecte : 0, statut } as const
  if (cle === 'fonds-entree') {
    return { ...base, rang: 0, estFondsEntree: true, date: projet?.dateDebut ?? '[DATE]', montant: projet?.fondsEntree ?? r.montantAffecte }
  }
  const m = /^([a-z]+)-(\d{4})$/.exec(cle)
  const mois = m ? MOIS.indexOf(m[1]!) : -1
  if (!m || mois < 0) return undefined
  return { ...base, rang: mois + 1, estFondsEntree: false, date: `${m[2]}-${String(mois + 1).padStart(2, '0')}-05`, montant: projet?.montantEcheance ?? r.montantAffecte }
}

export function echeancesCouvertes(p: Paiement): Echeance[] {
  const projet = store.projets.find(x => x.id === p.projetId)
  return p.repartition
    .map(r => echeanceRepartition(p, r, projet))
    .filter((e): e is Echeance => Boolean(e))
    .sort((a, b) => a.rang - b.rang)
}

export function paiementListe(p: Paiement): PaiementListe {
  return {
    ...p,
    souscripteur: store.souscripteurs.find(s => s.id === p.souscripteurId)!,
    projet: store.projets.find(x => x.id === p.projetId)!,
    traiteParNom: nomGestionnaire(p.traitePar),
    echeancesCouvertes: echeancesCouvertes(p),
  }
}

/**
 * 3 derniers versements validés d'un souscripteur sur un projet, hors le paiement consulté : une entrée par
 * échéance payée (hors fonds d'entrée), avec le gestionnaire du paiement qui la couvre quand il est connu.
 */
export function derniersVersements(p: Paiement): VersementValide[] {
  const exclues = new Set(p.repartition.map(r => r.echeanceId))
  return store.echeances
    .filter(e => e.projetId === p.projetId && e.souscripteurId === p.souscripteurId && !e.estFondsEntree
      && e.montantPaye > 0 && !exclues.has(e.id))
    .sort((a, b) => b.rang - a.rang)
    .slice(0, 3)
    .map((e) => {
      const valide = store.paiements.find(x => x.statut === 'valide' && x.repartition.some(r => r.echeanceId === e.id))
      return { echeanceId: e.id, date: e.date, montant: e.montantPaye, traiteParNom: nomGestionnaire(valide?.traitePar) }
    })
}

// ---------------------------------------------------------------- Mutations

/** État avant validation ou rejet, pour l'action « Annuler » du toast. */
interface Instantane {
  paiement: Paiement
  echeances: Echeance[]
  souscription?: { id: string, verse: number, reste: number, montantEnRetard: number, statut: string }
  projet?: { nbPaiementsAValider: number, nbEnRetard: number, montantCollecte: Projet['montantCollecte'] }
}
const instantanes = new Map<string, Instantane>()

function capturer(p: Paiement, ids: string[]) {
  const souscription = store.souscriptions.find(s => s.projetId === p.projetId && s.souscripteurId === p.souscripteurId)
  const projet = store.projets.find(x => x.id === p.projetId)
  instantanes.set(p.id, {
    paiement: structuredClone(p),
    echeances: store.echeances.filter(e => ids.includes(e.id)).map(e => ({ ...e })),
    souscription: souscription ? { id: souscription.id, verse: souscription.verse, reste: souscription.reste, montantEnRetard: souscription.montantEnRetard, statut: souscription.statut } : undefined,
    projet: projet ? { nbPaiementsAValider: projet.nbPaiementsAValider, nbEnRetard: projet.nbEnRetard, montantCollecte: projet.montantCollecte } : undefined,
  })
}

/** Échéance déclarée qui n'est plus couverte : elle retrouve son état d'avant la déclaration. */
function liberer(e: Echeance) {
  if (e.statut !== 'declaree') return
  const echue = e.date < maintenant().toISOString().slice(0, 10)
  e.statut = e.montantPaye > 0 ? 'partielle' : echue ? 'en_retard' : 'a_venir'
}

function actualiser(p: Paiement) {
  const souscription = store.souscriptions.find(s => s.projetId === p.projetId && s.souscripteurId === p.souscripteurId)
  if (souscription) actualiserSouscriptionProjet(souscription)
}

export function validerPaiement(p: Paiement, gestionnaireId: string, options: { repartition?: RepartitionEcheance[], montantRecu?: number } = {}) {
  const avant = p.repartition.map(r => r.echeanceId)
  const repartition = options.repartition?.length ? options.repartition : p.repartition
  capturer(p, [...new Set([...avant, ...repartition.map(r => r.echeanceId)])])

  for (const id of avant) {
    if (!repartition.some(r => r.echeanceId === id)) {
      const e = store.echeances.find(x => x.id === id)
      if (e) liberer(e)
    }
  }
  for (const r of repartition) {
    const e = store.echeances.find(x => x.id === r.echeanceId)
    if (!e) continue
    e.montantPaye = Math.min(e.montant, e.montantPaye + r.montantAffecte)
    e.statut = e.montantPaye >= e.montant ? 'payee' : 'partielle'
  }
  const ajustee = Boolean(options.repartition?.length) && JSON.stringify(repartition) !== JSON.stringify(p.repartition)
  Object.assign(p, {
    statut: 'valide',
    traiteLe: maintenant().toISOString(),
    traitePar: gestionnaireId,
    repartition,
    repartitionAjustee: p.repartitionAjustee || ajustee,
    ...(options.montantRecu ? { montantRecu: options.montantRecu } : {}),
  })
  actualiser(p)
  const projet = store.projets.find(x => x.id === p.projetId)
  if (projet) {
    projet.nbPaiementsAValider = Math.max(0, projet.nbPaiementsAValider - 1)
    if (typeof projet.montantCollecte === 'number') projet.montantCollecte += p.montantRecu ?? p.montant
  }
  return p
}

export function rejeterPaiement(p: Paiement, gestionnaireId: string, motif: Paiement['motifRejet'], message?: string) {
  const ids = p.repartition.map(r => r.echeanceId)
  capturer(p, ids)
  for (const id of ids) {
    const e = store.echeances.find(x => x.id === id)
    if (e) liberer(e)
  }
  Object.assign(p, { statut: 'rejete', traiteLe: maintenant().toISOString(), traitePar: gestionnaireId, motifRejet: motif, messageRejet: message })
  actualiser(p)
  const projet = store.projets.find(x => x.id === p.projetId)
  if (projet) projet.nbPaiementsAValider = Math.max(0, projet.nbPaiementsAValider - 1)
  return p
}

/** Annule la dernière validation ou le dernier rejet d'un paiement (toast « Annuler »). */
export function annulerTraitement(p: Paiement): Paiement | null {
  const i = instantanes.get(p.id)
  if (!i) return null
  instantanes.delete(p.id)
  // Champs ajoutés par le traitement (traiteLe, motifRejet…) retirés avant de restaurer l'état d'avant.
  for (const k of Object.keys(p)) Reflect.deleteProperty(p, k)
  Object.assign(p, i.paiement)
  for (const avant of i.echeances) {
    const e = store.echeances.find(x => x.id === avant.id)
    if (e) Object.assign(e, avant)
  }
  const s = i.souscription && store.souscriptions.find(x => x.id === i.souscription!.id)
  if (s && i.souscription) Object.assign(s, { ...i.souscription, statut: i.souscription.statut as typeof s.statut })
  const projet = store.projets.find(x => x.id === p.projetId)
  if (projet && i.projet) Object.assign(projet, i.projet)
  return p
}
