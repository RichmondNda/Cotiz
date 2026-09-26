<!--
  MgNouveauProjet — création de projet en 6 étapes : configurer un projet complet sans erreur, en comprenant
  l'impact de chaque paramètre sur l'échéancier.
  Desktop : indicateur d'étapes, formulaire à gauche (60 %), aperçu côté souscripteur collant à droite (40 %),
  barre d'actions fixe en bas (« Enregistrer le brouillon », « Retour », « Continuer » / « Créer le projet »).
  Mobile : en-tête avec retour, progression en segments, barre d'action fixe (précédent + continuer), sans navigation basse.
  Validation par étape ; quitter avec des modifications non enregistrées → confirmation ;
  création → écran « Projet créé ! » (ajouter des souscripteurs / voir le projet). `POST /api/projets`.
-->
<script setup lang="ts">
import type { Projet } from '~~/types'
import { creerFormulaireProjet, ETAPES_PROJET, fournirFormulaireProjet } from '~/composables/useNouveauProjet'
import EtapeProjetCalendrier from '~/components/metier/creation-projet/EtapeProjetCalendrier.vue'
import EtapeProjetContrat from '~/components/metier/creation-projet/EtapeProjetContrat.vue'
import EtapeProjetFinancement from '~/components/metier/creation-projet/EtapeProjetFinancement.vue'
import EtapeProjetInformations from '~/components/metier/creation-projet/EtapeProjetInformations.vue'
import EtapeProjetPaiement from '~/components/metier/creation-projet/EtapeProjetPaiement.vue'
import EtapeProjetRecapitulatif from '~/components/metier/creation-projet/EtapeProjetRecapitulatif.vue'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', navBasse: false })
useHead({ title: 'Nouveau projet · Cotiz' })
useFilAriane([{ label: 'Projets', to: '/asso/projets' }, { label: 'Nouveau projet' }])

const route = useRoute()
const router = useRouter()
const toast = useToast()
const creer = useCreationProjet()
const { data: moi } = useMoi()
const { data: association } = useAssociationGestionnaire()

const signataire = computed(() => ({
  nom: [moi.value?.prenom, moi.value?.nom].filter(Boolean).join(' '),
  fonction: moi.value?.fonction ?? '',
}))
const f = creerFormulaireProjet(association, signataire)
fournirFormulaireProjet(f)
const { etat, etape, modifie } = f

// Duplication (menu ⋯ « Dupliquer » de la liste) : `?modele=<id>` préremplit le formulaire depuis ce projet,
// une fois les valeurs par défaut de l'association posées.
const idModele = typeof route.query.modele === 'string' ? route.query.modele : ''
const { data: modele } = useProjet(idModele, { immediat: Boolean(idModele) })
let prerempli = false
watch([association, modele], ([a, m]) => {
  if (prerempli || !a || !m) return
  prerempli = true
  f.preremplir(m)
}, { immediate: true })

const COMPOSANTS = [
  EtapeProjetInformations,
  EtapeProjetFinancement,
  EtapeProjetCalendrier,
  EtapeProjetPaiement,
  EtapeProjetContrat,
  EtapeProjetRecapitulatif,
]
const etapes = [...ETAPES_PROJET]
const nomEtape = computed(() => ETAPES_PROJET[etape.value - 1])

const cree = ref<Projet | null>(null)
const envoi = ref<'creation' | 'brouillon' | null>(null)

function hautDePage() {
  if (import.meta.client) window.scrollTo({ top: 0 })
}
watch(etape, hautDePage)

/** Les erreurs de l'étape s'affichent sous les champs concernés. */
function continuer() {
  f.continuer()
}

async function creerProjet() {
  const invalide = f.premiereEtapeInvalide()
  if (invalide) {
    etape.value = invalide
    toast.alerte('Projet incomplet', { message: `Complétez l’étape « ${ETAPES_PROJET[invalide - 1]} ».` })
    return
  }
  envoi.value = 'creation'
  try {
    cree.value = await creer(f.corps())
    hautDePage()
  }
  catch {
    toast.erreur('Le projet n’a pas pu être créé', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoi.value = null
  }
}

/** Action principale de l'étape, commune à la barre desktop et à la barre mobile. */
const principal = computed(() => (etape.value < etapes.length
  ? { label: 'Continuer', action: continuer, chargement: false, libelleChargement: undefined }
  : { label: 'Créer le projet', action: creerProjet, chargement: envoi.value === 'creation', libelleChargement: 'Création…' }))

// ---------------------------------------------------------------- Brouillon et sortie
const confirmationQuitter = ref(false)
const destination = ref('/asso/projets')
let sortieAutorisee = false

async function sortir(vers: string) {
  sortieAutorisee = true
  confirmationQuitter.value = false
  await router.push(vers)
}

async function enregistrerBrouillon() {
  if (!etat.nom.trim()) {
    confirmationQuitter.value = false
    etape.value = 1
    f.continuer() // affiche l'erreur du nom sans avancer
    toast.alerte('Nommez le projet', { message: 'Un nom suffit pour enregistrer un brouillon.' })
    return
  }
  envoi.value = 'brouillon'
  try {
    await creer(f.corps(true))
    toast.succes('Brouillon enregistré', { message: `« ${etat.nom.trim()} » est dans vos brouillons.` })
    await sortir('/asso/projets?statut=brouillon')
  }
  catch {
    toast.erreur('Le brouillon n’a pas pu être enregistré', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoi.value = null
  }
}

/** Saisie en cours non enregistrée (ni créée, ni enregistrée en brouillon). */
const saisieEnCours = () => modifie.value && !cree.value && !sortieAutorisee

// Fermeture ou rechargement de l'onglet : confirmation native du navigateur.
function avantDechargement(e: BeforeUnloadEvent) {
  if (!saisieEnCours()) return
  e.preventDefault()
  e.returnValue = ''
}
onMounted(() => window.addEventListener('beforeunload', avantDechargement))
onBeforeUnmount(() => window.removeEventListener('beforeunload', avantDechargement))

onBeforeRouteLeave((to) => {
  if (!saisieEnCours()) return true
  destination.value = to.fullPath
  confirmationQuitter.value = true
  return false
})
</script>

<template>
  <div class="creation">
    <EnTeteGestionnaireMobile
      titre="Nouveau projet"
      :sous-titre="`Étape ${etape} sur ${etapes.length} · ${nomEtape}`"
      retour="/asso/projets"
      :cloche="false"
    />

    <template v-if="!cree">
      <EnTetePage
        titre="Nouveau projet"
        class="cz-desktop"
      >
        <template #actions>
          <CzButton
            variante="fantome"
            @click="router.push('/asso/projets')"
          >
            Quitter
          </CzButton>
        </template>
      </EnTetePage>

      <div class="creation__etapes cz-desktop">
        <CzSteps
          :etapes="etapes"
          :courante="etape"
          @aller="f.aller"
        />
      </div>
      <CzEtapesSegments
        :total="etapes.length"
        :courante="etape"
        class="cz-mobile"
      />

      <div class="creation__grille">
        <CzCard class="creation__formulaire">
          <component :is="COMPOSANTS[etape - 1]" />
        </CzCard>
        <ApercuProjetSouscripteur
          class="creation__apercu cz-desktop"
          :nom="etat.nom"
          :association="f.nomAssociation.value"
          :fonds-entree="f.fondsEntree.value"
          :montant-echeance="etat.montantEcheance"
          :frequence="etat.frequence"
          :nb-echeances="f.nbEcheances.value"
          :total="f.total.value"
        />
      </div>

      <div class="creation__barre cz-desktop">
        <CzButton
          variante="fantome"
          :chargement="envoi === 'brouillon'"
          libelle-chargement="Enregistrement…"
          @click="enregistrerBrouillon"
        >
          Enregistrer le brouillon
        </CzButton>
        <span class="creation__espace" />
        <CzButton
          v-if="etape > 1"
          variante="secondaire"
          @click="f.retour()"
        >
          Retour
        </CzButton>
        <CzButton
          :chargement="principal.chargement"
          :libelle-chargement="principal.libelleChargement"
          @click="principal.action"
        >
          {{ principal.label }}
        </CzButton>
      </div>
      <BarreActionMobile
        :precedent="etape > 1"
        @precedent="f.retour()"
      >
        <CzButton
          :chargement="principal.chargement"
          :libelle-chargement="principal.libelleChargement"
          @click="principal.action"
        >
          {{ principal.label }}
        </CzButton>
      </BarreActionMobile>
    </template>

    <!-- Succès -->
    <CzCard
      v-else
      class="creation__succes"
    >
      <CzIconeSucces :taille="80" />
      <h1 class="creation__succes-titre">
        Projet créé !
      </h1>
      <p class="creation__succes-texte cz-desktop">
        « {{ cree.nom }} » est prêt. Inscrivez maintenant vos souscripteurs.
      </p>
      <p class="creation__succes-texte cz-mobile">
        Ajoutez maintenant vos souscripteurs, un par un ou par import Excel.
      </p>
      <div class="creation__succes-actions">
        <CzButton :to="`/asso/projets/${cree.id}/souscripteurs?ajout=1`">
          Ajouter des souscripteurs
        </CzButton>
        <CzButton
          variante="secondaire"
          :to="`/asso/projets/${cree.id}`"
        >
          Voir le projet
        </CzButton>
      </div>
    </CzCard>

    <CzModal
      v-model:ouvert="confirmationQuitter"
      titre="Quitter sans enregistrer ?"
    >
      Les informations saisies<template v-if="etat.nom.trim()">
        pour « {{ etat.nom.trim() }} »
      </template> seront perdues. Vous pouvez aussi enregistrer un brouillon.
      <template #pied>
        <CzButton
          variante="fantome"
          taille="sm"
          @click="confirmationQuitter = false"
        >
          Rester
        </CzButton>
        <CzButton
          variante="secondaire"
          taille="sm"
          :chargement="envoi === 'brouillon'"
          @click="enregistrerBrouillon"
        >
          Enregistrer le brouillon
        </CzButton>
        <CzButton
          variante="danger"
          taille="sm"
          @click="sortir(destination)"
        >
          Quitter sans enregistrer
        </CzButton>
      </template>
    </CzModal>
  </div>
</template>

<style scoped>
.creation {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding-bottom: 88px;
}

.creation__etapes {
  padding: 14px 18px;
  border-radius: var(--r-tile);
  background: var(--surface);
}

.creation__grille {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: var(--space-6);
  align-items: start;
}

.creation__formulaire {
  padding: 28px;
}

/* Styles communs des étapes (composants metier/creation-projet). */
.creation__formulaire :deep(.etape) {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.creation__formulaire :deep(.etape__titre) {
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--text-strong);
}

.creation__apercu {
  position: sticky;
  top: calc(var(--topbar) + var(--space-4));
}

.creation__barre {
  position: fixed;
  right: 0;
  bottom: 0;
  left: var(--sidebar);
  z-index: 15;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 14px var(--space-8);
  border-top: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.creation__espace {
  flex: 1;
}

.creation__succes {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-4);
  width: 100%;
  max-width: 560px;
  margin: var(--space-8) auto 0;
  padding: 44px;
  text-align: center;
}

.creation__succes-titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  color: var(--text-strong);
}

.creation__succes-texte {
  margin: 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-muted);
}

.creation__succes-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-3);
  margin-top: var(--space-2);
}

@media (max-width: 1023px) {
  .creation__grille {
    grid-template-columns: minmax(0, 1fr);
  }

  .creation__barre {
    left: var(--sidebar-collapsed);
    padding: var(--space-3) var(--space-6);
  }

  .creation__apercu {
    position: static;
  }
}

@media (max-width: 767px) {
  .creation {
    gap: var(--space-4);
    padding-bottom: 96px;
  }

  .creation__formulaire {
    padding: var(--space-6);
  }

  .creation__formulaire :deep(.etape) {
    gap: var(--space-3);
  }

  .creation__formulaire :deep(.etape__titre) {
    font-size: 16px;
  }

  .creation__succes {
    margin-top: 0;
    padding: 28px 18px;
  }

  .creation__succes-titre {
    font-size: 21px;
  }

  .creation__succes-texte {
    font-size: 14.5px;
  }

  .creation__succes-actions {
    flex-direction: column;
    align-self: stretch;
  }
}
</style>
