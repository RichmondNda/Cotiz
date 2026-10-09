// État du formulaire de création de projet (MgNouveauProjet), partagé entre les 6 étapes :
// la page appelle `creerFormulaireProjet()` et le fournit ; chaque étape le récupère avec `useFormulaireProjet()`.
// Validation par étape (erreurs affichées après une tentative de « Continuer »), échéancier calculé, corps du POST.
import type { InjectionKey, Ref } from 'vue'
import type { Association, Frequence, ModalitePaiement, MoyenPaiement, NouveauProjet, Projet, TypeCalendrier } from '~~/types'
import { formatDate, formatFCFA, formatMois } from '~/utils/format'
import { lireDateSaisie, nbEcheances as compterEcheances, premieresEcheances, totalParSouscripteur, UNITES_FREQUENCE } from '~/utils/echeancier'
import type { TermesEcheancier } from '~/utils/echeancier'

export const ETAPES_PROJET = ['Informations', 'Financement', 'Calendrier', 'Paiement', 'Contrat', 'Récapitulatif'] as const

export const MOYENS_ORDRE: MoyenPaiement[] = ['virement', 'mobile_money', 'especes']

/** Variables insérables dans le contrat (remplacées à la génération du contrat de chaque souscripteur). */
export const VARIABLES_CONTRAT = ['{nom_souscripteur}', '{montant}', '{frequence}', '{date_debut}'] as const

export interface EtatFormulaireProjet {
  // 1. Informations
  nom: string
  description: string
  couverture: { nom: string, taille: number } | null
  souscripteursRequis: number
  sansLimite: boolean
  // 2. Financement
  fondsEntreeActif: boolean
  fondsEntree: number | null
  montantEcheance: number | null
  frequence: Frequence
  jourEcheance: number
  // 3. Calendrier
  typeCalendrier: TypeCalendrier
  dateDebut: string // saisie JJ/MM/AAAA
  dateFin: string
  delaiGrace: number | null
  // 4. Paiement
  moyens: Record<MoyenPaiement, boolean>
  coordonnees: { iban: string, mobileMoney: string, especes: string }
  instructions: string
  // 5. Contrat
  contrat: string | null // null = modèle généré (tant que la gestionnaire ne l'a pas modifié)
  signataireNom: string
  signataireFonction: string
  signe: boolean
}

type Erreurs = Partial<Record<string, string>>

function etatInitial(association: Association | null, signataire: { nom: string, fonction: string }): EtatFormulaireProjet {
  const modalite = (m: MoyenPaiement) => association?.modalitesPaiement.find(x => x.moyen === m)
  const mm = modalite('mobile_money')
  return {
    nom: '',
    description: '',
    couverture: null,
    souscripteursRequis: 10,
    sansLimite: false,
    fondsEntreeActif: true,
    fondsEntree: null,
    montantEcheance: null,
    frequence: 'mensuelle',
    jourEcheance: 5,
    typeCalendrier: 'dates_fixes',
    dateDebut: '',
    dateFin: '',
    delaiGrace: 5,
    // Reprise des moyens par défaut de l'association.
    moyens: { virement: Boolean(modalite('virement')), mobile_money: Boolean(mm), especes: Boolean(modalite('especes')) },
    coordonnees: {
      iban: modalite('virement')?.iban ?? '',
      mobileMoney: mm ? [mm.numeroMobileMoney, mm.operateur].filter(Boolean).join(' · ') : '',
      especes: modalite('especes')?.instructions ?? '',
    },
    instructions: '',
    contrat: null,
    signataireNom: signataire.nom,
    signataireFonction: signataire.fonction,
    signe: false,
  }
}

export function creerFormulaireProjet(
  association: Ref<Association | null | undefined>,
  signataire: Ref<{ nom: string, fonction: string }>,
) {
  const etat = reactive(etatInitial(association.value ?? null, signataire.value))
  const etape = ref(1)
  /** Étapes pour lesquelles « Continuer » a été tenté : leurs erreurs s'affichent. */
  const tentees = reactive(new Set<number>())
  const modifie = ref(false)

  // Les données de l'association et de la session peuvent arriver après la création du formulaire :
  // on complète les valeurs par défaut tant que rien n'a été saisi.
  let initialisation = false
  watch([() => association.value, signataire], ([a, s]) => {
    if (modifie.value) return
    initialisation = true
    Object.assign(etat, etatInitial(a ?? null, s))
    initialisation = false
  })
  watch(etat, () => {
    if (!initialisation) modifie.value = true
  }, { deep: true, flush: 'sync' })

  const nomAssociation = computed(() => association.value?.nom ?? '')
  const debutIso = computed(() => lireDateSaisie(etat.dateDebut))
  const finIso = computed(() => lireDateSaisie(etat.dateFin))
  const fondsEntree = computed(() => (etat.fondsEntreeActif ? etat.fondsEntree : null))
  const termes = computed((): TermesEcheancier | null => (debutIso.value && etat.montantEcheance
    ? {
        fondsEntree: fondsEntree.value,
        montantEcheance: etat.montantEcheance,
        frequence: etat.frequence,
        jourEcheance: etat.frequence === 'hebdomadaire' ? undefined : etat.jourEcheance,
        typeCalendrier: etat.typeCalendrier,
        dateDebut: debutIso.value,
        dateFin: finIso.value,
      }
    : null))
  const nbEcheances = computed(() => (termes.value ? compterEcheances(termes.value) : null))
  const total = computed(() => (termes.value ? totalParSouscripteur(termes.value) : null))
  const echeancier = computed(() => (termes.value ? premieresEcheances(termes.value) : []))

  const unite = computed(() => UNITES_FREQUENCE[etat.frequence])
  const moyensChoisis = computed(() => MOYENS_ORDRE.filter(m => etat.moyens[m]))

  /** Modèle de contrat pré-rempli à partir des étapes précédentes (tant qu'il n'a pas été retouché). */
  const contratModele = computed(() => {
    const asso = nomAssociation.value || '[ASSOCIATION]'
    const fonds = fondsEntree.value ? ` un fonds d’entrée de ${formatFCFA(fondsEntree.value)}, puis` : ''
    return `Je soussigné(e) {nom_souscripteur} m’engage à verser à ${asso}${fonds} {montant} de façon {frequence} à partir du {date_debut}, pour le projet ${etat.nom || '[NOM DU PROJET]'}.\n\n[Clauses du modèle à compléter par l’association.]`
  })
  const texteContrat = computed({
    get: () => etat.contrat ?? contratModele.value,
    set: (v: string) => (etat.contrat = v),
  })

  // ---------------------------------------------------------------- Validation
  function erreursEtape(n: number): Erreurs {
    const e: Erreurs = {}
    switch (n) {
      case 1:
        if (!etat.nom.trim()) e.nom = 'Donnez un nom au projet.'
        if (!etat.sansLimite && etat.souscripteursRequis < 1) e.souscripteursRequis = 'Au moins 1 souscripteur, ou « Sans limite ».'
        break
      case 2:
        if (etat.fondsEntreeActif && !(etat.fondsEntree && etat.fondsEntree > 0)) e.fondsEntree = 'Indiquez le montant du fonds d’entrée, ou désactivez-le.'
        if (!(etat.montantEcheance && etat.montantEcheance > 0)) e.montantEcheance = 'Indiquez le montant de chaque échéance.'
        break
      case 3:
        if (!debutIso.value) e.dateDebut = 'Date au format JJ/MM/AAAA.'
        if (etat.typeCalendrier === 'dates_fixes') {
          if (!finIso.value) e.dateFin = 'Date au format JJ/MM/AAAA.'
          else if (debutIso.value && finIso.value < debutIso.value) e.dateFin = 'La date de fin doit suivre la date de début.'
        }
        if (etat.delaiGrace === null || etat.delaiGrace < 0) e.delaiGrace = 'Indiquez un nombre de jours (0 si aucun délai).'
        break
      case 4:
        if (!moyensChoisis.value.length) e.moyens = 'Choisissez au moins un moyen de paiement.'
        break
      case 5:
        if (!texteContrat.value.trim()) e.contrat = 'Le texte du contrat est obligatoire.'
        if (!etat.signataireNom.trim()) e.signataireNom = 'Indiquez le nom du signataire.'
        if (!etat.signe) e.signe = 'Cochez la case pour signer le contrat au nom de l’association.'
        break
    }
    return e
  }
  const erreurs = computed<Erreurs>(() => (tentees.has(etape.value) ? erreursEtape(etape.value) : {}))
  const etapeValide = (n: number) => Object.keys(erreursEtape(n)).length === 0

  /** Passe à l'étape suivante si l'étape courante est valide ; sinon affiche ses erreurs. */
  function continuer(): boolean {
    tentees.add(etape.value)
    if (!etapeValide(etape.value)) return false
    etape.value = Math.min(ETAPES_PROJET.length, etape.value + 1)
    return true
  }
  function retour() {
    etape.value = Math.max(1, etape.value - 1)
  }
  function aller(n: number) {
    if (n < etape.value || [...Array(n - 1).keys()].every(i => etapeValide(i + 1))) etape.value = n
  }
  /** Première étape invalide (création finale), ou null. */
  function premiereEtapeInvalide(): number | null {
    for (let n = 1; n < ETAPES_PROJET.length; n++) {
      if (!etapeValide(n)) {
        tentees.add(n)
        return n
      }
    }
    return null
  }

  // ---------------------------------------------------------------- Résumés (récapitulatif)
  const resumeCalendrier = computed(() => {
    const grace = `grâce ${etat.delaiGrace ?? 0} j`
    if (etat.typeCalendrier === 'cycle_roulant') {
      return `Cycle roulant dès le ${debutIso.value ? formatDate(debutIso.value, 'numerique') : '—'} · ${grace}`
    }
    const periode = debutIso.value && finIso.value
      ? `${formatMois(debutIso.value).toLowerCase()} → ${formatMois(finIso.value).toLowerCase()}`
      : '—'
    return `Dates fixes · ${periode}${nbEcheances.value ? ` (${nbEcheances.value} échéances)` : ''} · ${grace}`
  })
  const periodeCourte = computed(() => (etat.typeCalendrier === 'cycle_roulant'
    ? 'Cycle roulant'
    : debutIso.value && finIso.value ? `${formatMois(debutIso.value).toLowerCase()} → ${formatMois(finIso.value).toLowerCase()}` : '—'))

  // ---------------------------------------------------------------- Duplication (menu ⋯ « Dupliquer »)
  /**
   * Préremplit le formulaire à partir d'un projet existant : mêmes paramètres, nom suffixé « (copie) »,
   * contrat repris mais à signer de nouveau. Les coordonnées de paiement restent celles de l'association.
   */
  function preremplir(p: Projet) {
    const date = (iso?: string) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? formatDate(iso, 'numerique') : '')
    Object.assign(etat, {
      nom: `${p.nom} (copie)`,
      description: p.description ?? '',
      souscripteursRequis: p.souscripteursRequis ?? etat.souscripteursRequis,
      sansLimite: p.souscripteursRequis === null,
      fondsEntreeActif: p.fondsEntree !== null,
      fondsEntree: p.fondsEntree,
      montantEcheance: p.montantEcheance,
      frequence: p.frequence,
      jourEcheance: p.jourEcheance ?? etat.jourEcheance,
      typeCalendrier: p.typeCalendrier,
      dateDebut: date(p.dateDebut),
      dateFin: date(p.dateFin),
      delaiGrace: p.delaiGraceJours,
      moyens: Object.fromEntries(MOYENS_ORDRE.map(m => [m, p.modalitesPaiement.some(x => x.moyen === m)])) as Record<MoyenPaiement, boolean>,
      instructions: p.instructionsPaiement ?? '',
      contrat: p.contratModele,
      signe: false,
    })
  }

  // ---------------------------------------------------------------- Corps du POST
  function modalites(): ModalitePaiement[] {
    return moyensChoisis.value.map((moyen): ModalitePaiement => {
      if (moyen === 'virement') return { moyen, iban: etat.coordonnees.iban || undefined }
      if (moyen === 'mobile_money') {
        const [numero, operateur] = etat.coordonnees.mobileMoney.split(' · ')
        return { moyen, numeroMobileMoney: numero || undefined, operateur: operateur || undefined }
      }
      return { moyen, instructions: etat.coordonnees.especes || undefined }
    })
  }

  function corps(brouillon = false): NouveauProjet {
    return {
      nom: etat.nom.trim(),
      description: etat.description.trim() || undefined,
      fondsEntree: fondsEntree.value,
      montantEcheance: etat.montantEcheance ?? 0,
      frequence: etat.frequence,
      jourEcheance: etat.frequence === 'hebdomadaire' ? undefined : etat.jourEcheance,
      typeCalendrier: etat.typeCalendrier,
      dateDebut: debutIso.value ?? '',
      dateFin: etat.typeCalendrier === 'dates_fixes' ? finIso.value ?? undefined : undefined,
      delaiGraceJours: etat.delaiGrace ?? 0,
      souscripteursRequis: etat.sansLimite ? null : etat.souscripteursRequis,
      modalitesPaiement: modalites(),
      instructionsPaiement: etat.instructions.trim() || undefined,
      contratModele: texteContrat.value,
      signataire: { nom: etat.signataireNom.trim(), fonction: etat.signataireFonction.trim() },
      contratSigne: etat.signe,
      brouillon,
    }
  }

  return {
    etat,
    etape,
    modifie,
    erreurs,
    continuer,
    retour,
    aller,
    premiereEtapeInvalide,
    nomAssociation,
    debutIso,
    finIso,
    fondsEntree,
    nbEcheances,
    total,
    echeancier,
    unite,
    moyensChoisis,
    texteContrat,
    resumeCalendrier,
    periodeCourte,
    corps,
    preremplir,
  }
}

export type FormulaireProjet = ReturnType<typeof creerFormulaireProjet>

const CLE_FORMULAIRE: InjectionKey<FormulaireProjet> = Symbol('formulaire-projet')

export function fournirFormulaireProjet(f: FormulaireProjet) {
  provide(CLE_FORMULAIRE, f)
}

/** Dans une étape : formulaire fourni par la page de création. */
export function useFormulaireProjet(): FormulaireProjet {
  const f = inject(CLE_FORMULAIRE)
  if (!f) throw new Error('useFormulaireProjet() hors de la page de création de projet')
  return f
}
