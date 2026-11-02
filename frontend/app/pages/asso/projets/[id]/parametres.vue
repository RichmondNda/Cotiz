<!--
  MgProjetParametres — consulter et ajuster ce qui peut encore l'être après la création.
  Desktop : Informations générales (nom, description, souscripteurs requis, image), Financement verrouillé (cadenas et
  infobulle), Calendrier (délai de grâce modifiable), Modalités de paiement (moyens, instructions), Relances (V2),
  « Enregistrer les modifications », Zone de danger (clôturer ; supprimer impossible dès qu'il y a des paiements).
  Mobile : Général, Financement en lecture seule (« Verrouillé »), coordonnées de paiement, « Enregistrer »,
  Zone sensible. Clôture : confirmation (modale / feuille basse), aussi ouverte par `?cloture=1` (menu ⋯ de l'en-tête).
  États : nominal, enregistre (bandeau après enregistrement), confirmation-cloture.
-->
<script setup lang="ts">
import type { ModalitePaiement, ModificationProjet, MoyenPaiement } from '~~/types'
import { codeErreur, messageRefus } from '~/composables/api/client'
import { estDate, formatFCFA, formatMois, pluriel } from '~/utils/format'

definePageMeta({ ongletProjet: 'parametres' })

const route = useRoute()
const router = useRouter()
const id = computed(() => String(route.params.id))
const { data: projet, refresh } = useProjet(id)
const { modifierProjet, cloturerProjet, supprimerProjet } = useActionsProjet()
const toast = useToast()

const termine = computed(() => projet.value?.statut === 'termine')
/** Des paiements ont été enregistrés : financement figé, suppression impossible. */
const aDesPaiements = computed(() => {
  const c = projet.value?.montantCollecte
  return projet.value?.financementVerrouille === true || typeof c !== 'number' || c > 0
})
/** Seul un brouillon se supprime (pr.delete) ; un projet publié se clôture. */
const supprimable = computed(() => projet.value?.statut === 'brouillon')
const noteSuppression = computed(() => {
  if (supprimable.value) return 'Le projet et ses inscriptions seront définitivement effacés.'
  return aDesPaiements.value
    ? 'Impossible : des paiements ont été enregistrés sur ce projet.'
    : 'Impossible : seul un brouillon peut être supprimé. Clôturez le projet pour l’arrêter.'
})

// ---------------------------------------------------------------- Formulaire
interface Formulaire {
  nom: string
  description: string
  imageCouvertureNom: string
  souscripteursRequis: string
  delaiGraceJours: string
  virement: boolean
  mobileMoney: boolean
  instructions: string
  numeroMobileMoney: string
  operateur: string
  iban: string
}

const form = reactive<Formulaire>({
  nom: '', description: '', imageCouvertureNom: '', souscripteursRequis: '', delaiGraceJours: '',
  virement: false, mobileMoney: false, instructions: '', numeroMobileMoney: '', operateur: '', iban: '',
})
const initial = ref('')
const erreurs = reactive<{ nom?: string, souscripteursRequis?: string, delaiGraceJours?: string }>({})
const enregistrement = ref(false)
const enregistre = ref(false)

function remplir() {
  const p = projet.value
  if (!p) return
  const mm = p.modalitesPaiement.find(m => m.moyen === 'mobile_money')
  const vir = p.modalitesPaiement.find(m => m.moyen === 'virement')
  Object.assign(form, {
    nom: p.nom,
    description: p.description ?? '',
    imageCouvertureNom: p.imageCouvertureNom ?? '',
    souscripteursRequis: p.souscripteursRequis === null ? '' : String(p.souscripteursRequis),
    delaiGraceJours: String(p.delaiGraceJours),
    virement: Boolean(vir),
    mobileMoney: Boolean(mm),
    instructions: p.instructionsPaiement ?? '',
    numeroMobileMoney: mm?.numeroMobileMoney ?? '',
    operateur: mm?.operateur ?? '',
    iban: vir?.iban ?? '',
  })
  initial.value = JSON.stringify(form)
}
watch(projet, remplir, { immediate: true })
const modifie = computed(() => JSON.stringify(form) !== initial.value)
watch(modifie, (v) => {
  if (v) enregistre.value = false
})

const entier = (v: string) => (/^\d+$/.test(v.trim()) ? Number(v.trim()) : null)

function valider(): boolean {
  erreurs.nom = form.nom.trim() ? undefined : 'Donnez un nom au projet.'
  const requis = form.souscripteursRequis.trim()
  const inscrits = typeof projet.value?.nbSouscripteurs === 'number' ? projet.value.nbSouscripteurs : 0
  erreurs.souscripteursRequis = !requis
    ? undefined
    : entier(requis) === null || entier(requis)! < 1
      ? 'Saisissez un nombre entier, ou laissez vide pour « sans limite ».'
      : entier(requis)! < inscrits
        ? `Le projet compte déjà ${pluriel(inscrits, 'souscripteur')}.`
        : undefined
  const delai = entier(form.delaiGraceJours)
  erreurs.delaiGraceJours = delai === null || delai > 90 ? 'Saisissez un nombre de jours entre 0 et 90.' : undefined
  return !erreurs.nom && !erreurs.souscripteursRequis && !erreurs.delaiGraceJours
}

function modalites(): ModalitePaiement[] {
  const existantes = projet.value?.modalitesPaiement ?? []
  const garder = (moyen: MoyenPaiement) => existantes.find(m => m.moyen === moyen) ?? { moyen }
  const liste: ModalitePaiement[] = existantes.filter(m => m.moyen !== 'virement' && m.moyen !== 'mobile_money')
  if (form.virement) liste.push({ ...garder('virement'), iban: form.iban.trim() || undefined })
  if (form.mobileMoney) {
    liste.push({ ...garder('mobile_money'), numeroMobileMoney: form.numeroMobileMoney.trim() || undefined, operateur: form.operateur.trim() || undefined })
  }
  return liste
}

async function enregistrer() {
  if (!valider()) return
  const modification: ModificationProjet = {
    nom: form.nom.trim(),
    description: form.description.trim(),
    imageCouvertureNom: form.imageCouvertureNom || undefined,
    souscripteursRequis: entier(form.souscripteursRequis),
    delaiGraceJours: entier(form.delaiGraceJours)!,
    modalitesPaiement: modalites(),
    instructionsPaiement: form.instructions.trim() || undefined,
  }
  enregistrement.value = true
  try {
    await modifierProjet(id.value, modification, projet.value?.version)
    await refresh()
    enregistre.value = true
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  catch (e) {
    toast.erreur('Les modifications n’ont pas été enregistrées', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    enregistrement.value = false
  }
}

// Image de couverture : V0, seul le nom du fichier est conservé (pas d'envoi).
const choixImage = ref<HTMLInputElement | null>(null)
function surImage(e: Event) {
  const fichier = (e.target as HTMLInputElement).files?.[0]
  if (fichier) form.imageCouvertureNom = fichier.name
}

// ---------------------------------------------------------------- Lecture seule
const financement = computed(() => {
  const p = projet.value
  if (!p) return null
  const periode = estDate(p.dateDebut) && estDate(p.dateFin)
    ? `${formatMois(p.dateDebut)} → ${formatMois(p.dateFin).toLowerCase()}`
    : estDate(p.dateDebut) ? `Depuis ${formatMois(p.dateDebut).toLowerCase()}` : p.dateDebut
  const frequence = { hebdomadaire: 'Hebdomadaire', mensuelle: 'Mensuelle', trimestrielle: 'Trimestrielle', semestrielle: 'Semestrielle', annuelle: 'Annuelle' }[p.frequence]
  return {
    fondsEntree: p.fondsEntree ? formatFCFA(p.fondsEntree) : 'Aucun',
    montant: formatFCFA(p.montantEcheance),
    frequence: p.jourEcheance ? `${frequence}, le ${p.jourEcheance}` : frequence,
    echeanceMobile: p.jourEcheance ? `${formatFCFA(p.montantEcheance)} · le ${p.jourEcheance} du mois` : formatFCFA(p.montantEcheance),
    type: p.typeCalendrier === 'dates_fixes' ? 'Dates fixes' : 'Cycle roulant',
    periode,
    periodeMobile: periode.charAt(0).toLowerCase() + periode.slice(1),
    delai: `${pluriel(p.delaiGraceJours, 'jour')}`,
  }
})
const raisonVerrou = computed(() => (aDesPaiements.value
  ? 'Non modifiable : des paiements ont été enregistrés'
  : 'Non modifiable : fixé par le contrat'))

// ---------------------------------------------------------------- Clôture
const confirmationCloture = ref(false)
const cloture = ref(false)
function demanderCloture() {
  if (!termine.value) confirmationCloture.value = true
}
onMounted(() => {
  if (route.query.cloture) {
    demanderCloture()
    router.replace({ query: { ...route.query, cloture: undefined } })
  }
})
watch(() => route.query.cloture, (v) => {
  if (v) {
    demanderCloture()
    router.replace({ query: { ...route.query, cloture: undefined } })
  }
})

// ---------------------------------------------------------------- Suppression (aucun paiement)
const confirmationSuppression = ref(false)
const suppression = ref(false)
async function supprimer() {
  const nom = projet.value?.nom
  suppression.value = true
  try {
    await supprimerProjet(id.value, projet.value?.version)
    confirmationSuppression.value = false
    await navigateTo('/asso/projets')
    await refreshNuxtData()
    toast.succes('Projet supprimé', { message: `« ${nom} » et ses inscriptions ont été effacés.` })
  }
  catch (e) {
    toast.erreur('Le projet n’a pas pu être supprimé', {
      message: codeErreur(e) === 'pas_brouillon'
        ? 'Seul un brouillon peut être supprimé : clôturez le projet à la place.'
        : messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.',
    })
  }
  finally {
    suppression.value = false
  }
}

async function cloturer() {
  cloture.value = true
  try {
    await cloturerProjet(id.value)
    confirmationCloture.value = false
    await refreshNuxtData()
    toast.succes('Projet clôturé', { message: 'Les souscripteurs ont été prévenus. Leur historique est conservé.' })
  }
  catch (e) {
    toast.erreur('Le projet n’a pas pu être clôturé', { message: messageRefus(e) ?? 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    cloture.value = false
  }
}
</script>

<template>
  <form
    v-if="projet && financement"
    class="parametres"
    novalidate
    @submit.prevent="enregistrer"
  >
    <CzAlert
      v-if="enregistre"
      ton="success"
      sans-icone
    >
      Modifications enregistrées.
    </CzAlert>
    <CzAlert
      v-if="termine"
      ton="info"
    >
      <b>Projet terminé.</b> Plus aucune échéance n’est générée ; les paramètres restent modifiables pour l’affichage.
    </CzAlert>

    <!-- Informations générales -->
    <CzCard
      tag="section"
      class="parametres__carte"
    >
      <h2 class="parametres__titre">
        <span class="cz-desktop">Informations générales</span><span class="cz-mobile">Général</span>
      </h2>
      <CzField
        label="Nom du projet"
        :erreur="erreurs.nom"
      >
        <CzInput
          v-model="form.nom"
          :erreur="Boolean(erreurs.nom)"
          :maxlength="80"
          @blur="form.nom.trim() && (erreurs.nom = undefined)"
        />
      </CzField>
      <CzField label="Description">
        <CzInput
          v-model="form.description"
          type="textarea"
          :lignes="3"
        />
      </CzField>
      <CzField
        label="Souscripteurs requis"
        :erreur="erreurs.souscripteursRequis"
        aide="Laissez vide pour « sans limite »."
        class="parametres__requis"
      >
        <CzInput
          v-model="form.souscripteursRequis"
          inputmode="numeric"
          :erreur="Boolean(erreurs.souscripteursRequis)"
        />
      </CzField>
      <div class="cz-file cz-desktop">
        <span class="thumb parametres__vignette"><CzIcon nom="image" /></span>
        <div class="parametres__fichier">
          <div class="nm">
            {{ form.imageCouvertureNom || 'Aucune image' }}
          </div>
          <div class="meta">
            Image de couverture
          </div>
        </div>
        <input
          ref="choixImage"
          type="file"
          accept="image/*"
          class="sr-only"
          tabindex="-1"
          aria-hidden="true"
          @change="surImage"
        >
        <CzButton
          variante="fantome"
          taille="sm"
          @click="choixImage?.click()"
        >
          {{ form.imageCouvertureNom ? 'Remplacer' : 'Ajouter' }}
        </CzButton>
      </div>
    </CzCard>

    <!-- Financement : desktop (champs verrouillés) -->
    <CzCard
      tag="section"
      class="parametres__carte cz-desktop"
    >
      <h2 class="parametres__titre">
        Financement <CzIcon
          nom="cadenas"
          class="parametres__cadenas"
          :aria-label="raisonVerrou"
          role="img"
        />
      </h2>
      <span class="cz-tip parametres__tip">{{ raisonVerrou }}</span>
      <div class="parametres__trois">
        <CzField label="Fonds d’entrée">
          <CzInput
            :model-value="financement.fondsEntree"
            readonly
          />
        </CzField>
        <CzField label="Montant par échéance">
          <CzInput
            :model-value="financement.montant"
            readonly
          />
        </CzField>
        <CzField label="Fréquence">
          <CzInput
            :model-value="financement.frequence"
            readonly
          />
        </CzField>
      </div>
    </CzCard>

    <!-- Financement : mobile (lecture seule) -->
    <CzCard
      tag="section"
      class="parametres__carte parametres__carte--serree cz-mobile"
    >
      <div class="parametres__ligne">
        <h2 class="parametres__titre">
          Financement
        </h2>
        <CzBadge petit>
          Verrouillé
        </CzBadge>
      </div>
      <p class="parametres__note">
        Fixé par le contrat signé : non modifiable.
      </p>
      <dl class="parametres__liste">
        <div><dt>Fonds d’entrée</dt><dd>{{ financement.fondsEntree }}</dd></div>
        <div><dt>Échéance</dt><dd>{{ financement.echeanceMobile }}</dd></div>
        <div><dt>Calendrier</dt><dd>{{ financement.periodeMobile }}</dd></div>
        <div><dt>Délai de grâce</dt><dd>{{ financement.delai }}</dd></div>
      </dl>
    </CzCard>

    <!-- Calendrier (desktop) -->
    <CzCard
      tag="section"
      class="parametres__carte cz-desktop"
    >
      <h2 class="parametres__titre">
        Calendrier
      </h2>
      <div class="parametres__trois">
        <CzField label="Type">
          <CzInput
            :model-value="financement.type"
            readonly
          />
        </CzField>
        <CzField label="Période">
          <CzInput
            :model-value="financement.periode"
            readonly
          />
        </CzField>
        <CzField
          label="Délai de grâce"
          :erreur="erreurs.delaiGraceJours"
        >
          <CzInput
            v-model="form.delaiGraceJours"
            inputmode="numeric"
            suffixe="jours"
            :erreur="Boolean(erreurs.delaiGraceJours)"
          />
        </CzField>
      </div>
    </CzCard>

    <!-- Modalités de paiement -->
    <CzCard
      tag="section"
      class="parametres__carte"
    >
      <h2 class="parametres__titre">
        Modalités de paiement
      </h2>
      <div class="parametres__moyens cz-desktop">
        <CzCheckbox v-model="form.virement">
          Virement bancaire
        </CzCheckbox>
        <CzCheckbox v-model="form.mobileMoney">
          Mobile money
        </CzCheckbox>
      </div>
      <CzField
        label="Instructions"
        class="cz-desktop"
      >
        <CzInput v-model="form.instructions" />
      </CzField>
      <CzField
        v-if="form.mobileMoney"
        label="Mobile money"
        class="cz-mobile"
      >
        <CzInput
          v-model="form.numeroMobileMoney"
          inputmode="tel"
          :suffixe="form.operateur || undefined"
        />
      </CzField>
      <CzField
        v-if="form.virement"
        label="Virement (IBAN)"
        class="cz-mobile"
      >
        <CzInput
          v-model="form.iban"
          mono
        />
      </CzField>
    </CzCard>

    <!-- Relances (V2, desktop) -->
    <CzCard
      tag="section"
      class="parametres__relances cz-desktop"
    >
      <div>
        <h2 class="parametres__titre">
          Relances <CzSoon petit>
            V2
          </CzSoon>
        </h2>
        <p class="parametres__note">
          Rappels automatiques avant et après chaque échéance.
        </p>
      </div>
      <CzButton
        variante="secondaire"
        taille="sm"
        to="/asso/relances"
      >
        Configurer
      </CzButton>
    </CzCard>

    <div class="parametres__actions">
      <CzButton
        type="submit"
        class="cz-desktop"
        :chargement="enregistrement"
        libelle-chargement="Enregistrement…"
      >
        Enregistrer les modifications
      </CzButton>
      <CzButton
        type="submit"
        bloc
        class="cz-mobile"
        :chargement="enregistrement"
        libelle-chargement="Enregistrement…"
      >
        Enregistrer
      </CzButton>
    </div>

    <!-- Zone de danger -->
    <section
      class="cz-card cz-card--flat parametres__danger"
      aria-labelledby="zone-danger"
    >
      <h2
        id="zone-danger"
        class="parametres__titre parametres__titre--danger"
      >
        <span class="cz-desktop">Zone de danger</span><span class="cz-mobile">Zone sensible</span>
      </h2>
      <div class="parametres__action-danger">
        <div>
          <b class="cz-desktop">Clôturer le projet</b>
          <p class="parametres__note">
            <template v-if="termine">
              Ce projet est déjà clôturé.
            </template>
            <template v-else>
              <span class="cz-desktop">Plus aucune échéance ne sera générée. Les souscripteurs gardent leur historique.</span>
              <span class="cz-mobile">Clôturer le projet arrête les échéances à venir. Les paiements validés sont conservés.</span>
            </template>
          </p>
        </div>
        <CzButton
          variante="danger-contour"
          class="cz-desktop"
          :disabled="termine"
          @click="demanderCloture"
        >
          Clôturer
        </CzButton>
        <CzButton
          variante="danger-contour"
          bloc
          class="cz-mobile"
          :disabled="termine"
          @click="demanderCloture"
        >
          Clôturer le projet
        </CzButton>
      </div>
      <!-- Mobile : seulement quand la suppression est possible (la maquette, avec paiements, ne la montre pas). -->
      <div
        class="parametres__action-danger"
        :class="{ 'cz-desktop': !supprimable }"
      >
        <div>
          <b>Supprimer le projet</b>
          <p class="parametres__note">
            {{ noteSuppression }}
          </p>
        </div>
        <CzButton
          variante="danger"
          :disabled="!supprimable"
          @click="confirmationSuppression = true"
        >
          Supprimer
        </CzButton>
      </div>
    </section>

    <CzConfirmation
      v-model:ouvert="confirmationCloture"
      :titre="`Clôturer ${projet.nom} ?`"
      confirmer="Clôturer définitivement"
      :chargement="cloture"
      libelle-chargement="Clôture…"
      @confirmer="cloturer"
    >
      <p class="parametres__confirmation">
        Les {{ pluriel(typeof projet.nbSouscripteurs === 'number' ? projet.nbSouscripteurs : 0, 'souscripteur') }} seront prévenus.
        Les échéances à venir seront annulées. Cette action est définitive.
      </p>
    </CzConfirmation>

    <CzConfirmation
      v-model:ouvert="confirmationSuppression"
      :titre="`Supprimer ${projet.nom} ?`"
      confirmer="Supprimer définitivement"
      :chargement="suppression"
      libelle-chargement="Suppression…"
      :texte-a-confirmer="projet.nom"
      label-saisie="Saisissez le nom du projet pour confirmer"
      @confirmer="supprimer"
    >
      <p class="parametres__confirmation">
        Le projet, ses {{ pluriel(typeof projet.nbSouscripteurs === 'number' ? projet.nbSouscripteurs : 0, 'inscription') }},
        son échéancier et ses contrats seront effacés. Cette action est définitive.
      </p>
    </CzConfirmation>
  </form>
</template>

<style scoped>
.parametres {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 860px;
}

.parametres__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-6);
}

.parametres__titre {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.parametres__titre--danger {
  color: var(--danger-fg);
}

.parametres__cadenas {
  width: 16px;
  height: 16px;
  color: var(--text-muted);
}

.parametres__tip {
  position: static;
  align-self: flex-start;
  max-width: 240px;
}

.parametres__trois {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.parametres__vignette {
  background: var(--brand-pale);
  color: var(--brand-dark);
}

.parametres__fichier {
  flex: 1;
  min-width: 0;
}

.parametres__moyens {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.parametres__note {
  margin: var(--space-1) 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

.parametres__relances {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-6);
}

.parametres__relances > div {
  flex: 1;
}

.parametres__actions {
  display: flex;
  justify-content: flex-end;
}

.parametres__danger {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
  border-color: var(--danger);
}

.parametres__action-danger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
}

.parametres__ligne {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.parametres__liste {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  font-size: 14px;
}

.parametres__liste div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
}

.parametres__liste dd {
  margin: 0;
  font-weight: 600;
  color: var(--text-strong);
  text-align: right;
}

.parametres__confirmation {
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: var(--text-muted);
}

@media (max-width: 767px) {
  .parametres {
    gap: var(--space-4);
  }

  .parametres__carte {
    padding: var(--space-6);
  }

  .parametres__carte--serree {
    gap: var(--space-2);
  }

  .parametres__danger {
    gap: var(--space-2);
    border-color: var(--danger-bg);
  }

  .parametres__action-danger {
    flex-direction: column;
    align-items: stretch;
  }

  .parametres__actions :deep(.cz-btn) {
    width: 100%;
  }
}
</style>
