// Import Excel de souscripteurs (MgImport) : état des 4 étapes (fichier, colonnes, vérification, envoi) partagé entre
// la page et les composants d'étape. V0 : le fichier n'est pas lu ; l'analyse (mock) renvoie le contenu de la maquette.
import type { InjectionKey } from 'vue'
import type { AnalyseImport, LigneImport } from '~~/types'
import { telephoneValide } from '~/utils/validation'

export type ChampImport = NonNullable<AnalyseImport['colonnes'][number]['champ']>
export type CanalImport = 'sms' | 'email' | 'les_deux'
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
/** Fichier proposé quand on clique sur la zone de dépôt (maquette : « membres_entraide.xlsx », 18 Ko). */
export const FICHIER_SIMULE = { nom: 'membres_entraide.xlsx', taille: 18 * 1024 }

const EN_ERREUR: LigneImport['statut'][] = ['telephone_incomplet', 'prenom_manquant']

export function creerImport(projetId: () => string) {
  const { analyserImport, importer } = useActionsProjet()

  const etat = reactive({
    etape: 1,
    fichier: null as { nom: string, taille?: number } | null,
    fichierInvalide: null as string | null,
    analyse: null as AnalyseImport | null,
    analyseEnCours: false,
    erreurReseau: false,
    colonnes: [] as { colonne: string, exemples: string[], champ: ChampImport | null }[],
    tenteColonnes: false,
    lignes: [] as LigneVerifiee[],
    canal: 'sms' as CanalImport,
    envoi: false,
    progression: 0,
    bilan: null as { importes: number, invitations: number, canal: CanalImport } | null,
  })

  async function deposer(fichier: { nom: string, taille?: number }) {
    etat.erreurReseau = false
    if (!/\.(xlsx|csv)$/i.test(fichier.nom)) {
      etat.fichier = null
      etat.analyse = null
      etat.fichierInvalide = fichier.nom
      return
    }
    etat.fichierInvalide = null
    etat.fichier = fichier
    etat.analyseEnCours = true
    try {
      const analyse = await analyserImport(projetId(), fichier.nom)
      etat.analyse = analyse
      etat.colonnes = analyse.colonnes.map(c => ({ ...c }))
      etat.lignes = analyse.lignes.map(l => ({ ...l }))
    }
    catch (e) {
      etat.fichier = null
      if (codeErreur(e) === 'fichier_invalide') etat.fichierInvalide = fichier.nom
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

  // ---------------------------------------------------------------- Vérification
  const aExaminer = computed(() => etat.lignes.filter(l => l.statut !== 'prete' && l.statut !== 'compte_existant'))
  const enErreur = (l: LigneImport) => EN_ERREUR.includes(l.statut)
  const compteurs = computed(() => {
    const base = etat.analyse?.compteurs ?? { pretes: 0, comptesExistants: 0, erreurs: 0, doublons: 0 }
    const corrigees = etat.lignes.filter(l => l.decision === 'corrigee').length
    const resolues = (statuts: (l: LigneImport) => boolean) => etat.lignes.filter(l => statuts(l) && l.decision).length
    return {
      pretes: base.pretes + corrigees,
      comptesExistants: base.comptesExistants,
      erreurs: base.erreurs - resolues(enErreur),
      doublons: base.doublons - resolues(l => l.statut === 'doublon'),
    }
  })
  const aImporter = computed(() => compteurs.value.pretes + compteurs.value.comptesExistants)
  const aCorriger = computed(() => compteurs.value.erreurs + compteurs.value.doublons)

  /** Valeur corrigée recevable ? (téléphone complet, prénom renseigné) */
  function correctionValide(l: LigneImport): boolean {
    if (l.statut === 'telephone_incomplet') return telephoneValide(l.telephone)
    if (l.statut === 'prenom_manquant') return l.prenom.trim().length > 0
    return true
  }
  function corriger(l: LigneVerifiee): boolean {
    if (!correctionValide(l)) return false
    l.decision = 'corrigee'
    return true
  }
  function ignorer(l: LigneVerifiee) {
    l.decision = 'ignoree'
  }

  // ---------------------------------------------------------------- Navigation
  function continuer(): boolean {
    if (etat.etape === 1 && !etat.analyse) return false
    if (etat.etape === 2) {
      etat.tenteColonnes = true
      if (erreurColonnes.value) return false
    }
    if (etat.etape < ETAPES_IMPORT.length) etat.etape++
    return true
  }
  function retour() {
    if (etat.etape > 1 && !etat.bilan) etat.etape--
  }
  function aller(n: number) {
    if (n < etat.etape && !etat.bilan) etat.etape = n
  }
  function recommencer() {
    Object.assign(etat, { etape: 1, fichier: null, fichierInvalide: null, analyse: null, colonnes: [], lignes: [], tenteColonnes: false })
  }

  async function lancer(): Promise<boolean> {
    etat.envoi = true
    etat.progression = 0
    const minuteur = setInterval(() => (etat.progression = Math.min(90, etat.progression + 15)), 120)
    try {
      const r = await importer(projetId(), aImporter.value, etat.canal)
      etat.progression = 100
      etat.bilan = { importes: r.importes, invitations: r.invitations, canal: etat.canal }
      return true
    }
    catch {
      return false
    }
    finally {
      clearInterval(minuteur)
      etat.envoi = false
    }
  }

  return {
    etat, erreurColonnes, lettreColonne, aExaminer, enErreur, compteurs, aImporter, aCorriger,
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
