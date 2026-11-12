// Import de souscripteurs (MgImport) : état des 4 étapes (fichier, colonnes, vérification, envoi) partagé entre la page
// et les composants d'étape. Lot 4.4 : le fichier est déposé et lu par le serveur (worker) ; l'écran relit l'import
// toutes les 2 s pendant l'analyse, le reclassement et l'envoi. Lignes et compteurs viennent du serveur.
import type { InjectionKey } from 'vue'
import type { AnalyseImport, LigneImport } from '~~/types'
import { telephoneValide } from '~/utils/validation'

export type ChampImport = NonNullable<AnalyseImport['colonnes'][number]['champ']>
/** Ligne à examiner, avec la décision du gestionnaire. */
export type LigneVerifiee = LigneImport & { decision?: 'corrigee' | 'ignoree' }

export const ETAPES_IMPORT = ['Fichier', 'Colonnes', 'Vérification', 'Envoi'] as const
export const CHAMPS_IMPORT: { valeur: ChampImport | 'ignorer', label: string }[] = [
  { valeur: 'prenom', label: 'Prénom' },
  { valeur: 'nom', label: 'Nom' },
  { valeur: 'telephone', label: 'Téléphone' },
  { valeur: 'email', label: 'Email' },
  { valeur: 'adresse', label: 'Adresse' },
  { valeur: 'ignorer', label: 'Ignorer' },
]
const OBLIGATOIRES: ChampImport[] = ['prenom', 'nom', 'telephone']

const EN_ERREUR: LigneImport['statut'][] = ['telephone_incomplet', 'prenom_manquant', 'erreur']
const CORRIGEABLES: LigneImport['statut'][] = ['telephone_incomplet', 'prenom_manquant']
const RETENUES: LigneImport['statut'][] = ['prete', 'compte_existant']

/** Ligne du serveur → ligne de l'écran ; une ligne ignorée (par le gestionnaire) le reste à l'affichage. */
const versLigne = (l: LigneImport): LigneVerifiee => (l.statut === 'ignoree' ? { ...l, decision: 'ignoree' } : { ...l })

export function creerImport(projetId: () => string) {
  const api = useActionsImport()
  let actif = true
  onScopeDispose(() => (actif = false))

  const etat = reactive({
    etape: 1,
    fichier: null as { nom: string, taille?: number } | null,
    /** Fichier refusé : nom et motif (extension, illisible, vide, trop long…). */
    fichierInvalide: null as string | null,
    motifInvalide: null as string | null,
    analyse: null as AnalyseImport | null,
    analyseEnCours: false,
    reclassement: false,
    erreurReseau: false,
    colonnes: [] as { colonne: string, exemples: string[], champ: ChampImport | null }[],
    tenteColonnes: false,
    lignes: [] as LigneVerifiee[],
    envoi: false,
    progression: 0,
    echecEnvoi: null as string | null,
    bilan: null as { importes: number, nouveaux: number, rattaches: number, echecs: number } | null,
  })

  const id = () => etat.analyse?.id ?? ''
  const actifPage = () => actif

  /** L'import a été classé : colonnes et lignes relues. */
  async function charger(a: AnalyseImport) {
    etat.analyse = a
    etat.colonnes = a.colonnes.map(c => ({ ...c }))
    etat.lignes = a.etat === 'pret' ? (await api.lignes(a.id)).map(versLigne) : []
  }

  async function deposer(fichier: File) {
    etat.erreurReseau = false
    etat.motifInvalide = null
    if (!/\.(xlsx|csv)$/i.test(fichier.name)) {
      Object.assign(etat, { fichier: null, analyse: null, fichierInvalide: fichier.name })
      return
    }
    etat.fichierInvalide = null
    etat.fichier = { nom: fichier.name, taille: fichier.size }
    etat.analyseEnCours = true
    try {
      const cree = await api.deposer(projetId(), fichier)
      const a = await api.attendre(cree.id, x => x.etat !== 'analyse', { actif: actifPage })
      if (a.etat === 'echec') {
        Object.assign(etat, { fichier: null, analyse: null, fichierInvalide: fichier.name, motifInvalide: a.echec })
        return
      }
      await charger(a)
    }
    catch (e) {
      etat.fichier = null
      if (codeErreur(e) === 'fichier_invalide') etat.fichierInvalide = fichier.name
      else etat.erreurReseau = true
    }
    finally {
      etat.analyseEnCours = false
    }
  }

  // ---------------------------------------------------------------- Colonnes
  const erreurColonnes = computed(() => {
    const champs = etat.colonnes.map(c => c.champ).filter(Boolean) as ChampImport[]
    const manquants = OBLIGATOIRES.filter(c => !champs.includes(c))
    if (manquants.length) {
      const noms = manquants.map(m => CHAMPS_IMPORT.find(c => c.valeur === m)!.label.toLowerCase())
      return `Associez une colonne à : ${noms.join(', ')}.`
    }
    const doublon = champs.find((c, i) => champs.indexOf(c) !== i)
    if (doublon) return `Le champ « ${CHAMPS_IMPORT.find(c => c.valeur === doublon)!.label} » est associé à deux colonnes.`
    return null
  })
  /** « Colonne A » : lettre de la colonne du fichier associée à un champ (mobile). */
  const lettreColonne = (i: number) => `Colonne ${String.fromCharCode(65 + i)}`
  const colonnesModifiees = () =>
    etat.analyse?.etat !== 'pret' || etat.colonnes.some((c, i) => c.champ !== etat.analyse?.colonnes[i]?.champ)

  /** Correspondance envoyée puis lignes reclassées par le worker. */
  async function reclasser(): Promise<boolean> {
    etat.reclassement = true
    etat.erreurReseau = false
    try {
      await api.colonnes(id(), etat.colonnes)
      const a = await api.attendre(id(), x => x.etat === 'pret' || x.etat === 'echec', { actif: actifPage })
      await charger(a)
      return a.etat === 'pret'
    }
    catch {
      etat.erreurReseau = true
      return false
    }
    finally {
      etat.reclassement = false
    }
  }

  // ---------------------------------------------------------------- Vérification
  const aExaminer = computed(() => etat.lignes.filter(l => !RETENUES.includes(l.statut) || l.decision === 'corrigee'))
  const enErreur = (l: LigneImport) => EN_ERREUR.includes(l.statut)
  const corrigeable = (l: LigneImport) => CORRIGEABLES.includes(l.statut)
  const compteurs = computed(() => {
    const c = etat.analyse?.compteurs ?? { pretes: 0, comptesExistants: 0, erreurs: 0, doublons: 0, ignorees: 0 }
    return { pretes: c.pretes, comptesExistants: c.comptesExistants, erreurs: c.erreurs, doublons: c.doublons }
  })
  const aImporter = computed(() => compteurs.value.pretes + compteurs.value.comptesExistants)
  const aCorriger = computed(() => compteurs.value.erreurs + compteurs.value.doublons)

  /** Valeur corrigée recevable ? (téléphone complet, prénom renseigné) — contrôle local avant l'envoi. */
  function correctionValide(l: LigneImport): boolean {
    if (l.statut === 'telephone_incomplet') return telephoneValide(l.telephone)
    if (l.statut === 'prenom_manquant') return l.prenom.trim().length > 0
    return true
  }
  function remplacer(l: LigneVerifiee, nouvelle: LigneVerifiee) {
    const i = etat.lignes.findIndex(x => x.id === l.id)
    if (i >= 0) etat.lignes[i] = nouvelle
  }
  async function compter() {
    if (etat.analyse) etat.analyse = { ...etat.analyse, compteurs: (await api.lire(id())).compteurs }
  }
  /** Correction envoyée et recontrôlée par le serveur : vrai si la ligne est désormais prête (ou rattachée). */
  async function corriger(l: LigneVerifiee): Promise<boolean> {
    if (!correctionValide(l)) return false
    const valeurs = l.statut === 'prenom_manquant' ? { prenom: l.prenom.trim() } : { telephone: l.telephone }
    const nouvelle: LigneVerifiee = await api.corriger(id(), l, { valeurs })
    const retenue = RETENUES.includes(nouvelle.statut)
    remplacer(l, retenue ? { ...nouvelle, decision: 'corrigee' } : nouvelle)
    await compter()
    return retenue
  }
  async function ignorer(l: LigneVerifiee) {
    remplacer(l, { ...(await api.corriger(id(), l, { ignorer: true })), decision: 'ignoree' })
    await compter()
  }

  // ---------------------------------------------------------------- Navigation
  async function continuer(): Promise<boolean> {
    if (etat.etape === 1 && etat.analyse?.etat !== 'pret' && etat.analyse?.etat !== 'colonnes') return false
    if (etat.etape === 2) {
      etat.tenteColonnes = true
      if (erreurColonnes.value) return false
      if (colonnesModifiees() && !(await reclasser())) return false
    }
    if (etat.etape < ETAPES_IMPORT.length) etat.etape++
    return true
  }
  function retour() {
    if (etat.etape > 1 && !etat.bilan && !etat.envoi) etat.etape--
  }
  function aller(n: number) {
    if (n < etat.etape && !etat.bilan && !etat.envoi) etat.etape = n
  }
  function recommencer() {
    Object.assign(etat, {
      etape: 1, fichier: null, fichierInvalide: null, motifInvalide: null, analyse: null, colonnes: [], lignes: [], tenteColonnes: false,
    })
  }

  /** Envoi, puis progression relue toutes les 2 s jusqu'au bilan. Faux si l'envoi est refusé ou s'interrompt. */
  async function lancer(): Promise<boolean> {
    etat.envoi = true
    etat.progression = 0
    etat.echecEnvoi = null
    try {
      await api.lancer(id())
      const a = await api.attendre(id(), x => x.etat === 'termine' || x.etat === 'echec', {
        actif: actifPage,
        suivre: (x) => {
          const p = x.progression
          if (p?.total) etat.progression = Math.round((p.traitees / p.total) * 100)
        },
      })
      etat.analyse = a
      if (a.etat !== 'termine' || !a.progression) {
        etat.echecEnvoi = a.echec
        return false
      }
      const p = a.progression
      etat.progression = 100
      etat.bilan = { importes: p.inscrits + p.rattaches, nouveaux: p.inscrits, rattaches: p.rattaches, echecs: p.echecs }
      return true
    }
    catch (e) {
      etat.echecEnvoi = codeErreur(e) === 'quota_atteint'
        ? 'Votre abonnement n’a plus assez de places pour ces souscripteurs.'
        : null
      return false
    }
    finally {
      etat.envoi = false
    }
  }

  return {
    etat, erreurColonnes, lettreColonne, aExaminer, enErreur, corrigeable, compteurs, aImporter, aCorriger,
    deposer, correctionValide, corriger, ignorer, continuer, retour, aller, recommencer, lancer,
  }
}

export type ImportSouscripteurs = ReturnType<typeof creerImport>
const CLE_IMPORT: InjectionKey<ImportSouscripteurs> = Symbol('import-souscripteurs')

export function fournirImport(i: ImportSouscripteurs) {
  provide(CLE_IMPORT, i)
}

export function useImportSouscripteurs(): ImportSouscripteurs {
  const i = inject(CLE_IMPORT)
  if (!i) throw new Error('useImportSouscripteurs() hors de la page d’import')
  return i
}
