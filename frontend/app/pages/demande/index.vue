<!--
  Demande de création d'association (/demande) : formulaire en 3 étapes (l'association, le responsable,
  vos besoins), validation à chaque étape, brouillon enregistré sur l'appareil, envoi puis redirection vers
  /demande/confirmation. `?plan=` pré-sélectionne le plan (cartes de tarif de la landing).
  Desktop : colonne de contexte (40 %) + carte formulaire (60 %). Mobile : ligne de contexte, étapes compactes.
-->
<script setup lang="ts">
import type { NouvelleDemande, TypeAssociation } from '~~/types'
import type { OptionSelect } from '~/components/cz/CzSelect.vue'
import { formatFCFA } from '~/utils/format'
import { emailValide, formatSaisieTelephone, telephoneValide } from '~/utils/validation'

definePageMeta({ layout: 'formulaire', theme: 'manager', retour: { label: 'Retour à l’accueil', to: '/' } })
useHead({ title: 'Créer mon association — Cotiz' })

const ETAPES = ['L’association', 'Le responsable', 'Vos besoins']
const DESCRIPTION_MAX = 500
const CLE_BROUILLON = 'cotiz_brouillon_demande'

const TYPES: OptionSelect<TypeAssociation>[] = [
  { valeur: 'association', label: 'Association' },
  { valeur: 'mutuelle', label: 'Mutuelle' },
  { valeur: 'tontine', label: 'Tontine' },
  { valeur: 'groupement', label: 'Groupement' },
  { valeur: 'autre', label: 'Autre' },
]
const PAYS = ['Côte d’Ivoire', 'Sénégal', 'Mali', 'Burkina Faso', 'Bénin', 'Togo', 'Niger', 'Guinée']
  .map(p => ({ valeur: p, label: p }))
const TRANCHES_SOUSCRIPTEURS = ['Moins de 50', '50 à 100', '100 à 250', 'Plus de 250'].map(t => ({ valeur: t, label: t }))
const TRANCHES_PROJETS = ['1', '2 à 3', '3 à 5', 'Plus de 5'].map(t => ({ valeur: t, label: t }))
const SOURCES = ['Bouche-à-oreille', 'Réseaux sociaux', 'Une autre association', 'Recherche internet', 'Autre']
  .map(s => ({ valeur: s, label: s }))

interface Formulaire {
  nom: string
  type: TypeAssociation | null
  numeroEnregistrement: string
  ville: string
  pays: string | null
  description: string
  prenom: string
  nomResponsable: string
  fonction: string
  email: string
  telephone: string
  souscripteursEstimes: string | null
  projetsEnvisages: string | null
  planId: string | null
  source: string | null
  cgu: boolean
}

const f = reactive<Formulaire>({
  nom: '',
  type: 'association',
  numeroEnregistrement: '',
  ville: '',
  pays: 'Côte d’Ivoire',
  description: '',
  prenom: '',
  nomResponsable: '',
  fonction: '',
  email: '',
  telephone: '',
  souscripteursEstimes: null,
  projetsEnvisages: '1',
  planId: null,
  source: null,
  cgu: false,
})

const etape = ref(1)
const tentee = reactive<Record<number, boolean>>({})
const envoi = ref(false)
const erreurEnvoi = ref(false)

// ---------------------------------------------------------------- Plans
const route = useRoute()
const { data: plans, pending: plansEnCours, error: erreurPlans, refresh: rechargerPlans } = usePlans()
const optionsPlans = computed(() => (plans.value ?? []).filter(p => p.statut === 'actif')
  .map(p => ({ valeur: p.id, titre: p.nom, detail: `${formatFCFA(p.prixMensuel)} / mois` })))

function planParDefaut() {
  const liste = plans.value ?? []
  const demande = typeof route.query.plan === 'string' ? route.query.plan : undefined
  if (demande && liste.some(p => p.id === demande)) f.planId = demande
  else if (!f.planId || !liste.some(p => p.id === f.planId)) f.planId = liste.find(p => p.misEnAvant)?.id ?? null
}
watch(plans, planParDefaut)

// ---------------------------------------------------------------- Brouillon (localStorage)
onMounted(() => {
  try {
    const brut = localStorage.getItem(CLE_BROUILLON)
    if (brut) Object.assign(f, JSON.parse(brut) as Partial<Formulaire>, { cgu: false })
  }
  catch {
    // Brouillon illisible ou stockage indisponible : on repart d'un formulaire vide.
  }
  planParDefaut()
  watch(f, () => {
    try {
      localStorage.setItem(CLE_BROUILLON, JSON.stringify({ ...f, cgu: false }))
    }
    catch {
      // Stockage indisponible (navigation privée) : pas de brouillon.
    }
  }, { deep: true })
})

// ---------------------------------------------------------------- Validation
const erreurs = computed(() => {
  const e: Partial<Record<keyof Formulaire, string>> = {}
  if (!f.nom.trim()) e.nom = 'Indiquez le nom de l’association'
  if (!f.type) e.type = 'Choisissez un type'
  if (!f.ville.trim()) e.ville = 'Indiquez la ville'
  if (!f.pays) e.pays = 'Choisissez un pays'
  if (!f.description.trim()) e.description = 'Décrivez l’activité en quelques mots'
  else if (f.description.length > DESCRIPTION_MAX) e.description = `${DESCRIPTION_MAX} caractères au maximum`
  if (!f.prenom.trim()) e.prenom = 'Indiquez le prénom'
  if (!f.nomResponsable.trim()) e.nomResponsable = 'Indiquez le nom'
  if (!f.fonction.trim()) e.fonction = 'Indiquez la fonction'
  if (!f.email.trim()) e.email = 'Indiquez l’adresse email'
  else if (!emailValide(f.email)) e.email = 'Adresse email incomplète'
  if (!f.telephone.trim()) e.telephone = 'Indiquez le numéro de téléphone'
  else if (!telephoneValide(f.telephone)) e.telephone = 'Numéro à 10 chiffres attendu'
  if (!f.souscripteursEstimes) e.souscripteursEstimes = 'Choisissez une tranche'
  if (!f.planId) e.planId = 'Choisissez un plan'
  if (!f.cgu) e.cgu = 'Acceptez les conditions générales pour envoyer la demande'
  return e
})

const CHAMPS_PAR_ETAPE: (keyof Formulaire)[][] = [
  ['nom', 'type', 'ville', 'pays', 'description'],
  ['prenom', 'nomResponsable', 'fonction', 'email', 'telephone'],
  ['souscripteursEstimes', 'planId', 'cgu'],
]

/** Message affiché sous un champ : seulement après une tentative de passage à l'étape suivante. */
function erreur(champ: keyof Formulaire) {
  const n = CHAMPS_PAR_ETAPE.findIndex(c => c.includes(champ)) + 1
  return tentee[n] ? erreurs.value[champ] : undefined
}
const nbErreursEtape = computed(() => CHAMPS_PAR_ETAPE[etape.value - 1]!.filter(c => erreurs.value[c]).length)

const carte = ref<HTMLElement | null>(null)
async function haut() {
  await nextTick()
  carte.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  carte.value?.querySelector<HTMLElement>('h2')?.focus()
}

function continuer() {
  tentee[etape.value] = true
  if (nbErreursEtape.value) {
    haut()
    return
  }
  etape.value += 1
  haut()
}

function retour() {
  etape.value = Math.max(1, etape.value - 1)
  haut()
}

// ---------------------------------------------------------------- Envoi
const envoyer = useEnvoiDemande()

async function soumettre() {
  tentee[3] = true
  if (nbErreursEtape.value) return
  envoi.value = true
  erreurEnvoi.value = false
  const demande: NouvelleDemande = {
    association: {
      nom: f.nom.trim(),
      type: f.type!,
      ville: f.ville.trim(),
      pays: f.pays!,
      ...(f.numeroEnregistrement.trim() ? { numeroEnregistrement: f.numeroEnregistrement.trim() } : {}),
      description: f.description.trim(),
    },
    responsable: {
      prenom: f.prenom.trim(),
      nom: f.nomResponsable.trim(),
      fonction: f.fonction.trim(),
      email: f.email.trim(),
      telephone: `+225 ${formatSaisieTelephone(f.telephone)}`,
    },
    besoins: {
      souscripteursEstimes: f.souscripteursEstimes!,
      projetsEnvisages: f.projetsEnvisages ?? '1',
      planSouhaiteId: f.planId!,
      source: f.source ?? '',
    },
    cguAcceptees: true,
  }
  try {
    await envoyer(demande)
    try {
      localStorage.removeItem(CLE_BROUILLON)
    }
    catch {
      // Stockage indisponible : rien à effacer.
    }
    await navigateTo('/demande/confirmation')
  }
  catch {
    erreurEnvoi.value = true
    envoi.value = false
  }
}
</script>

<template>
  <div class="demande">
    <aside class="demande__contexte">
      <h1 class="demande__titre">
        Créons l’espace de votre association
      </h1>
      <p class="demande__intro">
        Présentez-vous en moins de 5 minutes. Voici ce qui se passe ensuite :
      </p>
      <Frise
        label="Étapes après la demande"
        :evenements="[
          { titre: '1. Vous envoyez votre demande', detail: '3 étapes, sans engagement', ton: 'brand' },
          { titre: '2. Validation sous 48\u00A0h', detail: 'Notre équipe vérifie votre association', ton: 'info' },
          { titre: '3. Réception de vos accès', detail: 'Par email, pour configurer votre espace', ton: 'success' },
        ]"
      />
      <div class="demande__confiance">
        <span class="demande__cadenas"><CzIcon
          nom="cadenas"
          :taille="20"
        /></span>
        <div>
          <b>Vos informations restent confidentielles.</b>
          <div class="demande__confiance-texte">
            Elles servent uniquement à étudier votre demande.
          </div>
        </div>
      </div>
    </aside>

    <div class="demande__colonne">
      <div class="demande__entete-mobile">
        <h1 class="demande__titre">
          Créons l’espace de votre association
        </h1>
        <p class="demande__contexte-mobile">
          Demande → validation sous 48&nbsp;h → réception des accès
        </p>
      </div>

      <form
        ref="carte"
        class="cz-card demande__carte"
        novalidate
        @submit.prevent="etape < 3 ? continuer() : soumettre()"
      >
        <CzSteps
          :etapes="ETAPES"
          :courante="etape"
          @aller="etape = $event"
        />

        <!-- Étape 1 — L'association -->
        <fieldset
          v-if="etape === 1"
          class="demande__etape"
        >
          <h2
            class="demande__h2"
            tabindex="-1"
          >
            L’association
          </h2>
          <CzAlert
            v-if="tentee[1] && nbErreursEtape"
            ton="danger"
          >
            <b>{{ nbErreursEtape }} {{ nbErreursEtape > 1 ? 'champs' : 'champ' }} à corriger</b> avant de continuer.
          </CzAlert>
          <CzField
            label="Nom de l’association"
            requis
            :erreur="erreur('nom')"
          >
            <CzInput
              v-model="f.nom"
              placeholder="Ex. Entraide Yopougon"
              autocomplete="organization"
            />
          </CzField>
          <div class="demande__deux">
            <CzField
              label="Type"
              requis
              :erreur="erreur('type')"
            >
              <CzSelect
                v-model="f.type"
                :options="TYPES"
              />
            </CzField>
            <CzField label="Numéro d’enregistrement">
              <CzInput
                v-model="f.numeroEnregistrement"
                placeholder="Optionnel"
              />
            </CzField>
          </div>
          <div class="demande__deux">
            <CzField
              label="Ville"
              requis
              :erreur="erreur('ville')"
            >
              <CzInput
                v-model="f.ville"
                placeholder="Ex. Abidjan"
                autocomplete="address-level2"
              />
            </CzField>
            <CzField
              label="Pays"
              requis
              :erreur="erreur('pays')"
            >
              <CzSelect
                v-model="f.pays"
                :options="PAYS"
              />
            </CzField>
          </div>
          <CzField
            label="Description de l’activité"
            requis
            :erreur="erreur('description')"
          >
            <CzInput
              v-model="f.description"
              type="textarea"
              :lignes="4"
              :maxlength="DESCRIPTION_MAX"
              placeholder="Vos activités, vos membres, ce que vous financez…"
            />
            <template #aide>
              <span class="demande__compteur">{{ f.description.length }} / {{ DESCRIPTION_MAX }}</span>
            </template>
          </CzField>
        </fieldset>

        <!-- Étape 2 — Le responsable -->
        <fieldset
          v-else-if="etape === 2"
          class="demande__etape"
        >
          <h2
            class="demande__h2"
            tabindex="-1"
          >
            Le responsable
          </h2>
          <CzAlert
            v-if="tentee[2] && nbErreursEtape"
            ton="danger"
          >
            <b>{{ nbErreursEtape }} {{ nbErreursEtape > 1 ? 'champs' : 'champ' }} à corriger</b> avant de continuer.
          </CzAlert>
          <div class="demande__deux">
            <CzField
              label="Prénom"
              requis
              :erreur="erreur('prenom')"
            >
              <CzInput
                v-model="f.prenom"
                autocomplete="given-name"
              />
            </CzField>
            <CzField
              label="Nom"
              requis
              :erreur="erreur('nomResponsable')"
            >
              <CzInput
                v-model="f.nomResponsable"
                autocomplete="family-name"
              />
            </CzField>
          </div>
          <CzField
            label="Fonction dans l’association"
            requis
            :erreur="erreur('fonction')"
          >
            <CzInput
              v-model="f.fonction"
              placeholder="Ex. Trésorière"
              autocomplete="organization-title"
            />
          </CzField>
          <div class="demande__deux">
            <CzField
              label="Email"
              requis
              :erreur="erreur('email')"
            >
              <CzInput
                v-model="f.email"
                type="email"
                autocomplete="email"
                inputmode="email"
              />
            </CzField>
            <CzField
              label="Téléphone"
              requis
              :erreur="erreur('telephone')"
            >
              <CzInput
                v-model="f.telephone"
                type="telephone"
                autocomplete="tel-national"
                inputmode="numeric"
              />
            </CzField>
          </div>
        </fieldset>

        <!-- Étape 3 — Vos besoins -->
        <fieldset
          v-else
          class="demande__etape"
        >
          <h2
            class="demande__h2"
            tabindex="-1"
          >
            Vos besoins
          </h2>
          <CzAlert
            v-if="erreurEnvoi"
            ton="danger"
          >
            <b>La demande n’a pas pu être envoyée.</b> Vérifiez votre connexion puis réessayez.
          </CzAlert>
          <div class="demande__deux">
            <CzField
              label="Nombre estimé de souscripteurs"
              requis
              :erreur="erreur('souscripteursEstimes')"
            >
              <CzSelect
                v-model="f.souscripteursEstimes"
                :options="TRANCHES_SOUSCRIPTEURS"
                placeholder="Choisir une tranche"
                :erreur="Boolean(erreur('souscripteursEstimes'))"
              />
            </CzField>
            <CzField label="Projets envisagés">
              <CzSelect
                v-model="f.projetsEnvisages"
                :options="TRANCHES_PROJETS"
              />
            </CzField>
          </div>
          <div class="cz-field">
            <span
              id="demande-plan"
              class="cz-label"
            >Plan souhaité <span
              class="req"
              aria-hidden="true"
            >*</span></span>
            <div
              v-if="plansEnCours"
              class="demande__plans-squelette"
            >
              <CzSkeleton
                v-for="i in 3"
                :key="i"
                :hauteur="72"
              />
            </div>
            <CzAlert
              v-else-if="erreurPlans"
              ton="danger"
              lien="Réessayer"
              @lien="rechargerPlans()"
            >
              Les plans n’ont pas pu être chargés.
            </CzAlert>
            <CzCartesRadio
              v-else
              v-model="f.planId"
              :options="optionsPlans"
              label="Plan souhaité"
              :erreur="Boolean(erreur('planId'))"
            />
            <span
              v-if="erreur('planId')"
              class="cz-error"
            ><CzIcon nom="alerte" />{{ erreur('planId') }}</span>
          </div>
          <CzField label="Comment avez-vous connu Cotiz ?">
            <CzSelect
              v-model="f.source"
              :options="SOURCES"
            />
          </CzField>
          <div class="cz-field">
            <CzCheckbox
              v-model="f.cgu"
              :erreur="Boolean(erreur('cgu'))"
              class="demande__cgu"
            >
              <span>J’accepte les <NuxtLink
                to="/legal/cgu"
                target="_blank"
              >conditions générales d’utilisation</NuxtLink></span>
            </CzCheckbox>
            <span
              v-if="erreur('cgu')"
              class="cz-error"
            ><CzIcon nom="alerte" />{{ erreur('cgu') }}</span>
          </div>
        </fieldset>

        <div class="demande__pied">
          <span
            v-if="etape === 1"
            class="demande__brouillon"
          >Brouillon enregistré sur cet appareil</span>
          <CzButton
            v-else
            variante="fantome"
            @click="retour"
          >
            Retour
          </CzButton>
          <CzButton
            type="submit"
            class="demande__principal"
            :chargement="envoi"
            libelle-chargement="Envoi en cours…"
          >
            {{ etape < 3 ? 'Continuer' : 'Envoyer ma demande' }}
          </CzButton>
        </div>
      </form>
    </div>
  </div>
</template>

<style scoped>
.demande {
  display: grid;
  grid-template-columns: 2fr 3fr;
  gap: calc(var(--space-12) + var(--space-4));
  align-items: start;
  max-width: calc(1200px + 2 * var(--space-12));
  margin: 0 auto;
  padding: calc(var(--space-12) + var(--space-2)) var(--space-12);
}

.demande__contexte {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding-top: var(--space-2);
}

.demande__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--ink-title);
}

.demande__intro {
  margin: 0;
  font-size: 15px;
  color: var(--text-muted);
}

.demande__confiance {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4);
  border-radius: var(--r-tile);
  background: var(--surface);
  box-shadow: var(--shadow);
  font-size: 13.5px;
}

.demande__confiance b {
  color: var(--text-strong);
}

.demande__confiance-texte {
  color: var(--text-muted);
}

.demande__cadenas {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: var(--r-field);
  background: var(--brand-pale);
  color: var(--brand-dark);
}

.demande__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

.demande__entete-mobile {
  display: none;
}

.demande__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding: var(--space-8);
  scroll-margin-top: var(--space-4);
}

.demande__etape {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.demande__h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  color: var(--text-strong);
}

.demande__h2:focus {
  outline: none;
}

.demande__deux {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.demande__compteur {
  display: block;
  text-align: right;
}

.demande__plans-squelette {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}

.demande__cgu {
  min-height: 44px;
}

.demande__cgu a {
  color: var(--violet-dark);
  text-decoration: none;
}

.demande__cgu a:hover {
  text-decoration: underline;
}

.demande__pied {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--divider);
}

.demande__brouillon {
  font-size: 12px;
  color: var(--text-muted);
}

.demande__principal {
  margin-left: auto;
}

@media (max-width: 1023px) {
  .demande {
    grid-template-columns: 1fr;
    gap: var(--space-6);
    padding: var(--space-8) var(--space-6);
  }

  .demande__contexte {
    display: none;
  }

  .demande__entete-mobile {
    display: block;
  }

  .demande__contexte-mobile {
    margin: var(--space-1) 0 0;
    font-size: 13.5px;
    color: var(--text-muted);
  }
}

@media (max-width: 767px) {
  .demande {
    padding: var(--space-6) var(--space-4) var(--space-8);
  }

  .demande__titre {
    font-size: 26px;
  }

  .demande__carte {
    gap: var(--space-6);
    padding: var(--space-4);
  }

  .demande__deux,
  .demande__plans-squelette {
    grid-template-columns: 1fr;
  }

  .demande__principal {
    height: var(--control-lg);
    padding: 0 var(--space-6);
  }
}
</style>
