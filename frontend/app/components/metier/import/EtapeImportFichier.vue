<!--
  Import, étape 1 — Fichier : zone de dépôt grand format (.xlsx, .csv), aide sur les colonnes attendues,
  « Télécharger le modèle Excel ». V0 : un clic sur la zone simule le dépôt de « membres_entraide.xlsx » ;
  un fichier glissé ou choisi (« Choisir un autre fichier ») est accepté sur son extension.
  Fichier invalide : zone en erreur (desktop), bandeau « Fichier illisible » (mobile).
-->
<script setup lang="ts">
import { FICHIER_SIMULE, useImportSouscripteurs } from '~/composables/useImportSouscripteurs'
import { telechargerCsv } from '~/utils/csv'

const { etat, deposer } = useImportSouscripteurs()

const choix = ref<HTMLInputElement | null>(null)
const survol = ref(false)

function surChoix(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) deposer({ nom: f.name, taille: f.size })
  ;(e.target as HTMLInputElement).value = ''
}
function surDepot(e: DragEvent) {
  survol.value = false
  const f = e.dataTransfer?.files[0]
  if (f) deposer({ nom: f.name, taille: f.size })
}
function simuler() {
  if (!etat.analyseEnCours) deposer(FICHIER_SIMULE)
}
function taille(octets?: number) {
  return octets === undefined ? '' : ` · ${Math.max(1, Math.round(octets / 1024))}\u00A0Ko`
}

function telechargerModele() {
  telechargerCsv('modele-import-souscripteurs.csv', [
    ['Prénom', 'Nom', 'Téléphone', 'Email', 'Adresse'],
    ['Aïcha', 'Bamba', '+225 07 12 34 56 78', '', 'Yopougon'],
  ])
}
</script>

<template>
  <div class="etape-fichier">
    <h2 class="etape-fichier__titre cz-desktop">
      Votre fichier
    </h2>

    <CzAlert
      v-if="etat.fichierInvalide"
      ton="danger"
      sans-icone
      class="cz-mobile"
    >
      <b>Fichier illisible.</b> Utilisez un fichier .xlsx ou .csv avec une ligne par souscripteur.
    </CzAlert>
    <CzAlert
      v-if="etat.erreurReseau"
      ton="danger"
    >
      <b>Analyse impossible.</b> Vérifiez votre connexion, puis réessayez.
    </CzAlert>

    <input
      ref="choix"
      type="file"
      accept=".xlsx,.csv"
      class="sr-only"
      tabindex="-1"
      aria-label="Choisir un fichier à importer"
      @change="surChoix"
    >

    <!-- Fichier retenu -->
    <div
      v-if="etat.fichier"
      class="cz-drop etape-fichier__retenu"
      aria-live="polite"
    >
      <template v-if="etat.analyseEnCours">
        <CzSpinner />
        <span class="etape-fichier__meta">Analyse de {{ etat.fichier.nom }}…</span>
      </template>
      <template v-else>
        <b class="etape-fichier__nom">{{ etat.fichier.nom }}</b>
        <span class="etape-fichier__meta">{{ etat.analyse?.nbLignes }} lignes{{ taille(etat.fichier.taille) }}</span>
        <CzButton
          variante="secondaire"
          taille="sm"
          @click="choix?.click()"
        >
          Choisir un autre fichier
        </CzButton>
      </template>
    </div>

    <!-- Zone de dépôt -->
    <button
      v-else
      type="button"
      class="cz-drop etape-fichier__zone"
      :class="{ 'is-hover': survol, 'is-error': etat.fichierInvalide }"
      @click="simuler"
      @dragenter.prevent="survol = true"
      @dragover.prevent="survol = true"
      @dragleave.prevent="survol = false"
      @drop.prevent="surDepot"
    >
      <template v-if="etat.fichierInvalide">
        <CzIcon
          nom="alerte"
          class="etape-fichier__icone"
        />
        <b
          class="etape-fichier__erreur"
          role="alert"
        >{{ etat.fichierInvalide }} n’est pas un fichier valide</b>
        <span class="fmt">Formats acceptés : .xlsx ou .csv</span>
      </template>
      <template v-else>
        <CzIcon
          nom="importer"
          class="etape-fichier__icone"
        />
        <span class="etape-fichier__texte">Glissez votre fichier ici ou <strong>parcourez vos fichiers</strong></span>
        <span class="fmt">.xlsx ou .csv · cliquez pour simuler le dépôt de « {{ FICHIER_SIMULE.nom }} »</span>
      </template>
    </button>

    <div class="etape-fichier__pied">
      <span class="cz-desktop">Colonnes attendues : prénom, nom, téléphone, email (optionnel), adresse (optionnelle).</span>
      <button
        type="button"
        class="etape-fichier__modele"
        @click="telechargerModele"
      >
        Télécharger le modèle Excel
      </button>
    </div>
  </div>
</template>

<style scoped>
.etape-fichier {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.etape-fichier__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.etape-fichier__zone,
.etape-fichier__retenu {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  min-height: 190px;
  padding: var(--space-12);
  font: inherit;
  text-align: center;
}

.etape-fichier__zone {
  cursor: pointer;
}

.etape-fichier__zone:focus-visible {
  outline: none;
  border-color: var(--brand);
  box-shadow: var(--focus-ring);
}

.etape-fichier__icone {
  width: 28px;
  height: 28px;
  color: var(--brand);
}

.is-error .etape-fichier__icone,
.etape-fichier__erreur {
  color: var(--danger-fg);
}

.etape-fichier__texte {
  font-size: 15px;
}

.etape-fichier__nom {
  color: var(--text-strong);
}

.etape-fichier__meta {
  font-size: 13px;
  color: var(--text-muted);
}

.etape-fichier__pied {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  font-size: 13.5px;
  color: var(--text-muted);
}

.etape-fichier__modele {
  min-height: 44px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--text);
  cursor: pointer;
}

.etape-fichier__modele:hover {
  text-decoration: underline;
}

@media (max-width: 767px) {
  .etape-fichier {
    gap: var(--space-3);
  }

  .etape-fichier__zone,
  .etape-fichier__retenu {
    min-height: 150px;
    padding: var(--space-6);
  }

  .etape-fichier__pied {
    padding: 0 var(--space-4);
  }

  .etape-fichier__modele {
    font-size: 13px;
    color: var(--brand-dark);
  }
}
</style>
