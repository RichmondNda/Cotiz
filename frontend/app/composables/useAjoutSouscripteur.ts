// Ajout d'un souscripteur à un projet (MgAjoutSouscripteur) : état partagé entre l'enveloppe (modale desktop,
// plein écran mobile) et le corps du formulaire. 4 cas : saisie du téléphone, compte existant retrouvé,
// nouveau compte, déjà inscrit au projet. Numéros mockés : server/mocks/IDENTIFIANTS.md.
import type { InjectionKey } from 'vue'
import type { Projet, ResultatRechercheSouscripteur, SouscriptionAvecSouscripteur } from '~~/types'
import { maintenant } from '~/utils/date-reference'
import { dateEcheance, formatSaisieDate, lireDateSaisie } from '~/utils/echeancier'
import { formatDate, formatMois } from '~/utils/format'
import { telephoneValide } from '~/utils/validation'

export type EtapeAjout = 'telephone' | 'compte_existant' | 'nouveau' | 'deja_inscrit'

export function creerAjoutSouscripteur(projet: () => Projet, onInscrit: (s: SouscriptionAvecSouscripteur, encore: boolean) => void) {
  const { rechercherSouscripteur, inscrireSouscripteur } = useActionsProjet()
  const toast = useToast()

  const etat = reactive({
    etape: 'telephone' as EtapeAjout,
    telephone: '',
    resultat: null as ResultatRechercheSouscripteur | null,
    prenom: '',
    nom: '',
    email: '',
    adresse: '',
    canal: 'sms' as 'sms' | 'email',
    dateEntree: formatDate(maintenant(), 'numerique'),
    rattrapage: { fonds: true, passes: false, courant: true },
    tentee: false,
    envoi: false,
  })

  // ---------------------------------------------------------------- Échéances passées à rattraper
  const calendrier = computed(() => {
    const p = projet()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dateDebut) || !p.nbEcheances) return []
    return Array.from({ length: p.nbEcheances }, (_, i) => ({
      rang: (p.fondsEntree ? 1 : 0) + i,
      date: dateEcheance(p.dateDebut, p.frequence, i, p.jourEcheance)!,
    }))
  })
  const debutMois = computed(() => {
    const d = maintenant()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const passes = computed(() => calendrier.value.filter(e => e.date.slice(0, 7) < debutMois.value))
  const courant = computed(() => calendrier.value.find(e => e.date.slice(0, 7) === debutMois.value))
  const libellePasses = computed(() => {
    const p = passes.value
    if (!p.length) return ''
    const mois = (d: string) => formatMois(d, 'seul').toLowerCase()
    return p.length === 1 ? formatMois(p[0]!.date, 'seul') : `${formatMois(p[0]!.date, 'seul')} → ${mois(p.at(-1)!.date)} (${p.length})`
  })

  // ---------------------------------------------------------------- Validation
  const erreurs = computed(() => {
    const e: Partial<Record<'telephone' | 'prenom' | 'nom' | 'dateEntree', string>> = {}
    if (!etat.tentee) return e
    if (!telephoneValide(etat.telephone)) e.telephone = 'Numéro à 10 chiffres, ex. 07 12 34 56 78.'
    if (etat.etape === 'nouveau') {
      if (!etat.prenom.trim()) e.prenom = 'Prénom obligatoire.'
      if (!etat.nom.trim()) e.nom = 'Nom obligatoire.'
      if (!lireDateSaisie(etat.dateEntree)) e.dateEntree = 'Date au format JJ/MM/AAAA.'
    }
    return e
  })

  function reinitialiser() {
    Object.assign(etat, {
      etape: 'telephone', telephone: '', resultat: null, prenom: '', nom: '', email: '', adresse: '', canal: 'sms',
      dateEntree: formatDate(maintenant(), 'numerique'), rattrapage: { fonds: true, passes: false, courant: true }, tentee: false, envoi: false,
    })
  }
  function autreNumero() {
    etat.etape = 'telephone'
    etat.resultat = null
    etat.tentee = false
  }

  async function rechercher() {
    etat.tentee = true
    if (erreurs.value.telephone) return
    etat.envoi = true
    try {
      const r = await rechercherSouscripteur(projet().id, etat.telephone)
      etat.resultat = r
      etat.etape = r.cas
      etat.tentee = false
    }
    catch {
      toast.erreur('La recherche a échoué', { message: 'Vérifiez votre connexion, puis réessayez.' })
    }
    finally {
      etat.envoi = false
    }
  }

  async function inscrire(encore = false) {
    etat.tentee = true
    if (Object.keys(erreurs.value).length) return
    const r = etat.resultat
    const rattrapage = [
      ...(etat.rattrapage.fonds && projet().fondsEntree ? [0] : []),
      ...(etat.rattrapage.passes ? passes.value.map(e => e.rang) : []),
      ...(etat.rattrapage.courant && courant.value ? [courant.value.rang] : []),
    ]
    etat.envoi = true
    try {
      const inscrit = await inscrireSouscripteur(projet().id, r?.cas === 'compte_existant'
        ? { telephone: etat.telephone, souscripteurId: r.souscripteur.id }
        : {
            telephone: etat.telephone,
            prenom: etat.prenom.trim(),
            nom: etat.nom.trim(),
            email: etat.email.trim() || undefined,
            adresse: etat.adresse.trim() || undefined,
            canal: etat.canal,
            dateEntree: lireDateSaisie(etat.dateEntree) ?? undefined,
            rattrapage,
          })
      const nom = `${inscrit.souscripteur.prenom} ${inscrit.souscripteur.nom}`
      toast.succes('Souscripteur inscrit', {
        message: r?.cas === 'compte_existant'
          ? `${nom} rejoint le projet et reçoit une invitation à signer le contrat.`
          : `${nom} a reçu ses identifiants par ${etat.canal === 'sms' ? 'SMS' : 'email'}.`,
      })
      reinitialiser()
      onInscrit(inscrit, encore)
    }
    catch {
      toast.erreur('L’inscription a échoué', { message: 'Vérifiez votre connexion, puis réessayez.' })
    }
    finally {
      etat.envoi = false
    }
  }

  return {
    etat,
    erreurs,
    passes,
    courant,
    libellePasses,
    masqueDate: (v: string | number | null) => (etat.dateEntree = formatSaisieDate(String(v ?? ''))),
    rechercher,
    inscrire,
    autreNumero,
    reinitialiser,
  }
}

export type AjoutSouscripteur = ReturnType<typeof creerAjoutSouscripteur>

const CLE: InjectionKey<AjoutSouscripteur> = Symbol('ajout-souscripteur')
export const fournirAjoutSouscripteur = (a: AjoutSouscripteur) => provide(CLE, a)
export function useAjoutSouscripteur(): AjoutSouscripteur {
  const a = inject(CLE)
  if (!a) throw new Error('useAjoutSouscripteur() hors de AjoutSouscripteur')
  return a
}
