<!--
  MgPaiements — file de validation : traiter tous les paiements déclarés, tous projets confondus, le plus vite possible.
  Desktop : titre et compteur, raccourcis (V valider · R rejeter · ↓ suivant), onglets À valider · Validés · Rejetés · Tous,
  filtres (projet, ancienneté, montant), maître-détail : liste (le plus ancien en haut, ancienneté en rouge au-delà de
  5 jours) et aperçu du paiement sélectionné (ApercuPaiement). Validation / rejet → paiement suivant, toast « Annuler ».
  Mobile : en-tête « Paiements · 6 à valider », segments À valider · Validés · Tous, cartes (« Voir la preuve » ouvre le
  détail plein écran, « Valider » valide directement avec toast « Annuler »).
  Compteurs de navigation (barre latérale, navigation basse) rechargés après chaque traitement.
  Onglet dans l'URL (`?onglet=valides`). Scénarios : `file-vide` (+ `chargement`, `erreur`).
-->
<script setup lang="ts">
import type { PaiementListe, RejetPaiement } from '~~/types'
import { formatFCFA, formatRelatif, joursDepuis, pluriel } from '~/utils/format'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Paiements à valider' })
useHead({ title: 'Paiements à valider · Cotiz' })

type Onglet = 'a_valider' | 'valides' | 'rejetes' | 'tous'

const route = useRoute()
const router = useRouter()
const { data, pending, error, refresh } = usePaiements()
const { estMobile } = useBreakpoint()

// ---------------------------------------------------------------- Onglet (URL)
const ONGLETS: Onglet[] = ['a_valider', 'valides', 'rejetes', 'tous']
const onglet = computed<Onglet>({
  get: () => (ONGLETS.includes(route.query.onglet as Onglet) ? route.query.onglet as Onglet : 'a_valider'),
  set: v => router.replace({ query: { ...route.query, onglet: v === 'a_valider' ? undefined : v } }),
})

// ---------------------------------------------------------------- Filtres (puces à valeurs successives)
const projets = computed(() => [...new Map((data.value ?? []).map(p => [p.projetId, p.projet.nom])).entries()])
const filtreProjet = ref<string | null>(null)
const ANCIENNETES = [
  { label: 'toutes', test: () => true },
  { label: 'plus de 2 jours', test: (p: PaiementListe) => joursDepuis(p.declareLe) > 2 },
  { label: 'plus de 5 jours', test: (p: PaiementListe) => joursDepuis(p.declareLe) > 5 },
]
const MONTANTS = [
  { label: 'tous', test: () => true },
  { label: 'moins de 25 000 F', test: (p: PaiementListe) => p.montant < 25000 },
  { label: '25 000 F et plus', test: (p: PaiementListe) => p.montant >= 25000 },
]
const anciennete = ref(0)
const montant = ref(0)
function projetSuivant() {
  const ids = [null, ...projets.value.map(([id]) => id)]
  filtreProjet.value = ids[(ids.indexOf(filtreProjet.value) + 1) % ids.length] ?? null
}
const libelleProjet = computed(() => projets.value.find(([id]) => id === filtreProjet.value)?.[1] ?? 'tous')

// ---------------------------------------------------------------- Données
const tous = computed(() => data.value ?? [])
const enAttente = computed(() => tous.value
  .filter(p => p.statut === 'en_attente')
  .sort((a, b) => a.declareLe.localeCompare(b.declareLe)))
const nbEnAttente = computed(() => enAttente.value.length)

const liste = computed(() => {
  const base = onglet.value === 'a_valider'
    ? enAttente.value
    : tous.value.filter(p => onglet.value === 'tous'
      || (onglet.value === 'valides' && p.statut === 'valide')
      || (onglet.value === 'rejetes' && p.statut === 'rejete'))
  return base.filter(p => (!filtreProjet.value || p.projetId === filtreProjet.value)
    && ANCIENNETES[anciennete.value]!.test(p) && MONTANTS[montant.value]!.test(p))
})

const chargement = computed(() => pending.value && !data.value)
const nom = (p: PaiementListe) => `${p.souscripteur.prenom} ${p.souscripteur.nom}`
const ancien = (p: PaiementListe) => p.statut === 'en_attente' && joursDepuis(p.declareLe) > 5

// ---------------------------------------------------------------- Sélection (desktop)
const selectionId = ref<string | null>(null)
const selection = computed(() => liste.value.find(p => p.id === selectionId.value) ?? liste.value[0] ?? null)
watch(onglet, () => (selectionId.value = null))

function selectionner(p: PaiementListe | undefined) {
  if (!p) return
  selectionId.value = p.id
  nextTick(() => document.getElementById(`paiement-${p.id}`)?.focus())
}
function decaler(pas: number) {
  const i = liste.value.findIndex(p => p.id === selection.value?.id)
  selectionner(liste.value[Math.min(liste.value.length - 1, Math.max(0, i + pas))])
}

/** Paiement en attente qui suit `p` dans la file (le suivant, sinon le précédent). */
function suivantDe(p: PaiementListe): string | null {
  const file = enAttente.value
  const i = file.findIndex(x => x.id === p.id)
  return (file[i + 1] ?? file[i - 1])?.id ?? null
}

// ---------------------------------------------------------------- Traitement
const aRejeter = ref<PaiementListe | null>(null)
const rejetOuvert = ref(false)
const { envoi, validerPaiement: valider, rejeterPaiement: rejeter } = useTraitementAnnulable(refresh)
/** Paiement en cours de traitement (bouton en chargement). */
const enCours = computed(() => envoi.value?.id ?? null)

/** Après le traitement : paiement suivant ; « Annuler » le resélectionne. */
const suite = (p: PaiementListe, message: string) => {
  const suivant = suivantDe(p)
  return {
    message,
    puis: () => (selectionId.value = suivant),
    annulation: { message: `Le paiement de ${nom(p)} est de nouveau à valider.`, puis: () => (selectionId.value = p.id) },
  }
}

function validerPaiement(p: PaiementListe) {
  return valider(p.id, {}, suite(p, estMobile.value ? `${formatFCFA(p.montant)} de ${nom(p)}.` : 'Passage au paiement suivant.'))
}

function ouvrirRejet(p: PaiementListe) {
  aRejeter.value = p
  rejetOuvert.value = true
}

async function rejeterPaiement(corps: RejetPaiement) {
  const p = aRejeter.value
  if (!p) return
  const options = suite(p, 'Passage au paiement suivant.')
  await rejeter(p.id, corps, { ...options, puis: () => {
    rejetOuvert.value = false
    options.puis()
  } })
}

// ---------------------------------------------------------------- Raccourcis clavier (desktop)
function surTouche(e: KeyboardEvent) {
  if (estMobile.value || rejetOuvert.value || e.ctrlKey || e.metaKey || e.altKey) return
  const cible = e.target as HTMLElement | null
  if (cible?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
  const p = selection.value
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    decaler(1)
  }
  else if (e.key === 'ArrowUp') {
    e.preventDefault()
    decaler(-1)
  }
  else if ((e.key === 'v' || e.key === 'V') && p?.statut === 'en_attente') {
    e.preventDefault()
    validerPaiement(p)
  }
  else if ((e.key === 'r' || e.key === 'R') && p?.statut === 'en_attente') {
    e.preventDefault()
    ouvrirRejet(p)
  }
}
onMounted(() => window.addEventListener('keydown', surTouche))
onBeforeUnmount(() => window.removeEventListener('keydown', surTouche))

// ---------------------------------------------------------------- Libellés
const ongletsDesktop = computed(() => [
  { valeur: 'a_valider', label: `À valider · ${nbEnAttente.value}` },
  { valeur: 'valides', label: 'Validés' },
  { valeur: 'rejetes', label: 'Rejetés' },
  { valeur: 'tous', label: 'Tous' },
])
const ongletsMobile = computed(() => [
  { valeur: 'a_valider' as Onglet, label: `À valider (${nbEnAttente.value})` },
  { valeur: 'valides' as Onglet, label: 'Validés' },
  { valeur: 'tous' as Onglet, label: 'Tous' },
])
const ongletTabs = computed<string | undefined>({
  get: () => onglet.value,
  set: v => (onglet.value = ONGLETS.includes(v as Onglet) ? v as Onglet : 'a_valider'),
})
const ongletMobile = computed<Onglet>({
  get: () => (onglet.value === 'rejetes' ? 'tous' : onglet.value),
  set: v => (onglet.value = v),
})
const vide = computed(() => ({
  a_valider: { titre: 'Rien à valider', description: 'Tous les paiements déclarés ont été traités.' },
  valides: { titre: 'Aucun paiement validé', description: 'Les paiements que vous validez apparaissent ici.' },
  rejetes: { titre: 'Aucun paiement rejeté', description: 'Les paiements que vous rejetez apparaissent ici.' },
  tous: { titre: 'Aucun paiement déclaré', description: 'Les déclarations de vos souscripteurs apparaissent ici.' },
})[onglet.value])
const filtresActifs = computed(() => Boolean(filtreProjet.value) || anciennete.value > 0 || montant.value > 0)
function effacerFiltres() {
  filtreProjet.value = null
  anciennete.value = 0
  montant.value = 0
}
</script>

<template>
  <div class="file">
    <EnTeteGestionnaireMobile
      titre="Paiements"
      :sous-titre="nbEnAttente ? `${nbEnAttente} à valider` : 'Aucune déclaration en attente'"
    />

    <EnTetePage
      titre="Paiements à valider"
      class="cz-desktop"
    >
      <template #apres-titre>
        <CzCount
          :valeur="nbEnAttente"
          class="file__compteur"
        />
      </template>
      <template #actions>
        <span class="file__raccourcis">Raccourcis : V valider · R rejeter · ↓ suivant</span>
      </template>
    </EnTetePage>

    <CzTabs
      v-model="ongletTabs"
      :onglets="ongletsDesktop"
      label="Statut des paiements"
      class="cz-desktop"
    />
    <CzSegmented
      v-model="ongletMobile"
      :options="ongletsMobile"
      label="Statut des paiements"
      pleine-largeur
      class="cz-mobile"
    />

    <div class="cz-toolbar cz-desktop">
      <CzChip
        :actif="Boolean(filtreProjet)"
        @click="projetSuivant"
      >
        Projet : {{ libelleProjet }}
      </CzChip>
      <CzChip
        :actif="anciennete > 0"
        @click="anciennete = (anciennete + 1) % ANCIENNETES.length"
      >
        Ancienneté : {{ ANCIENNETES[anciennete]!.label }}
      </CzChip>
      <CzChip
        :actif="montant > 0"
        @click="montant = (montant + 1) % MONTANTS.length"
      >
        Montant : {{ MONTANTS[montant]!.label }}
      </CzChip>
    </div>

    <!-- Chargement -->
    <div
      v-if="chargement"
      class="file__maitre-detail"
      aria-busy="true"
    >
      <div class="cz-card file__liste">
        <div
          v-for="i in 6"
          :key="i"
          class="file__squelette"
        >
          <CzSkeleton
            :hauteur="30"
            :largeur="30"
            forme="rond"
          />
          <div class="file__squelette-textes">
            <CzSkeleton
              :hauteur="12"
              largeur="60%"
            />
            <CzSkeleton
              :hauteur="10"
              largeur="40%"
            />
          </div>
          <CzSkeleton
            :hauteur="12"
            :largeur="64"
          />
        </div>
      </div>
      <CzSkeleton
        :hauteur="340"
        class="cz-desktop"
      />
    </div>

    <div
      v-else-if="error"
      class="cz-card"
    >
      <CzErreurChargement
        titre="Impossible d’afficher les paiements"
        @reessayer="refresh()"
      />
    </div>

    <!-- File vide -->
    <div
      v-else-if="!liste.length"
      class="cz-card file__vide"
    >
      <CzEmpty
        :icone="onglet === 'a_valider' && !filtresActifs ? 'valide' : 'paiement'"
        :ton="onglet === 'a_valider' && !filtresActifs ? 'success' : 'brand'"
        :titre="filtresActifs ? 'Aucun paiement pour ces filtres' : vide.titre"
        :description="filtresActifs ? 'Modifiez ou effacez les filtres.' : vide.description"
        integre
        class="cz-desktop"
      >
        <template #action>
          <CzButton
            v-if="filtresActifs"
            variante="secondaire"
            taille="sm"
            @click="effacerFiltres"
          >
            Effacer les filtres
          </CzButton>
          <CzButton
            v-else-if="onglet === 'a_valider'"
            variante="secondaire"
            taille="sm"
            to="/asso"
          >
            Retour au tableau de bord
          </CzButton>
        </template>
      </CzEmpty>
      <CzEmpty
        :icone="onglet === 'a_valider' ? 'coche' : 'paiement'"
        :ton="onglet === 'a_valider' ? 'success' : 'brand'"
        :titre="onglet === 'a_valider' ? 'Tout est à jour' : vide.titre"
        :description="onglet === 'a_valider' ? 'Aucune déclaration en attente de validation.' : vide.description"
        integre
        class="cz-mobile"
      />
    </div>

    <template v-else>
      <!-- Desktop : maître-détail -->
      <div class="file__maitre-detail cz-desktop">
        <div
          class="cz-card file__liste"
          role="listbox"
          aria-label="Paiements"
        >
          <button
            v-for="p in liste"
            :id="`paiement-${p.id}`"
            :key="p.id"
            type="button"
            role="option"
            class="file__element"
            :class="{ 'is-on': p.id === selection?.id }"
            :aria-selected="p.id === selection?.id"
            :tabindex="p.id === selection?.id ? 0 : -1"
            @click="selectionId = p.id"
          >
            <CzAvatar
              :nom="nom(p)"
              taille="sm"
            />
            <span class="file__qui">
              <b>{{ nom(p) }}</b>
              <span class="file__projet">{{ p.projet.nom }}</span>
            </span>
            <span class="file__montant">
              <b>{{ formatFCFA(p.montant) }}</b>
              <span
                class="file__age"
                :class="{ 'is-ancien': ancien(p) }"
              >{{ formatRelatif(p.declareLe, { style: 'long' }) }}</span>
            </span>
          </button>
        </div>
        <ApercuPaiement
          v-if="selection"
          :paiement="selection"
          :envoi="enCours === selection.id"
          @valider="validerPaiement(selection)"
          @rejeter="ouvrirRejet(selection)"
        />
      </div>

      <!-- Mobile : cartes -->
      <div class="file__cartes cz-mobile">
        <CartePaiementFile
          v-for="p in liste"
          :key="p.id"
          :paiement="p"
          :envoi="enCours === p.id"
          @valider="validerPaiement(p)"
        />
      </div>
    </template>

    <ModaleRejetPaiement
      v-if="aRejeter"
      v-model:ouvert="rejetOuvert"
      :montant="aRejeter.montant"
      :prenom="aRejeter.souscripteur.prenom"
      :nom="aRejeter.souscripteur.nom"
      :envoi="enCours === aRejeter.id"
      @rejeter="rejeterPaiement"
    />
    <p
      class="sr-only"
      aria-live="polite"
    >
      {{ pluriel(nbEnAttente, 'paiement') }} à valider
    </p>
  </div>
</template>

<style scoped>
.file {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.file__compteur {
  height: 24px;
  padding: 0 10px;
  font-size: 13px;
}

.file__raccourcis {
  align-self: center;
  font-size: 12.5px;
  color: var(--text-muted);
}

.file__maitre-detail {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
  gap: var(--space-4);
  align-items: start;
}

.file__liste {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-2);
}

.file__element {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  min-height: 44px;
  padding: var(--space-3);
  border: 0;
  border-radius: var(--r-md);
  background: transparent;
  font: inherit;
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}

.file__element:hover {
  background: var(--surface-hover);
}

.file__element.is-on {
  background: var(--brand-pale);
}

.file__element:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.file__qui {
  flex: 1;
  min-width: 0;
}

.file__qui b,
.file__montant b {
  display: block;
  color: var(--text-strong);
}

.file__qui b {
  font-weight: 600;
}

.file__montant b {
  font-family: var(--font-display);
  font-weight: 600;
  white-space: nowrap;
}

.file__projet {
  font-size: 12.5px;
  color: var(--text-muted);
}

.file__montant {
  text-align: right;
}

.file__age {
  font-size: 12px;
  color: var(--text-muted);
}

.file__age.is-ancien {
  color: var(--danger-fg);
  font-weight: 600;
}

.file__squelette {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
}

.file__squelette-textes {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

.file__vide {
  padding: var(--space-12);
}

.file__cartes {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

@media (max-width: 767px) {
  .file {
    gap: var(--space-3);
  }

  .file__maitre-detail {
    grid-template-columns: minmax(0, 1fr);
  }

  .file__vide {
    padding: var(--space-12) var(--space-4);
  }
}
</style>
