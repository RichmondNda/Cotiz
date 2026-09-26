<!--
  Visionneuse de preuve de paiement.
  - image : miniature 120×150, clic = plein écran avec zoom et rotation ; « Télécharger » discret dessous ;
  - pdf : aperçu de la page 1 + « Ouvrir le PDF » ;
  - référence seule : encart avec la référence de transaction en mono et bouton copier.
-->
<script setup lang="ts">
import type { Preuve } from '~~/types'

const props = withDefaults(defineProps<{
  preuve: Preuve
  /** Ligne d'aide sous la référence (« Mobile money · Orange · 10 sept. 2026 »). */
  detail?: string
}>(), { detail: undefined })

const pleinEcran = ref(false)
const zoom = ref(1)
const rotation = ref(0)
const copie = ref(false)

function ouvrir() {
  zoom.value = 1
  rotation.value = 0
  pleinEcran.value = true
}
async function copier(ref: string) {
  try {
    await navigator.clipboard.writeText(ref)
    copie.value = true
    setTimeout(() => (copie.value = false), 1500)
  }
  catch {
    // Presse-papiers indisponible : rien à faire.
  }
}
const reference = computed(() => props.preuve.reference)
</script>

<template>
  <div class="preuve">
    <template v-if="preuve.type === 'image'">
      <button
        type="button"
        class="cz-proof"
        :aria-label="`Agrandir la preuve ${preuve.nomFichier}`"
        @click="ouvrir"
      >
        <span class="glyph glyph--repos"><CzIcon nom="image" /></span>
        <span class="glyph glyph--survol"><CzIcon nom="voir" /></span>
        <span class="preuve__nom">{{ preuve.nomFichier }}</span>
      </button>
      <CzButton
        variante="fantome"
        taille="sm"
        icone="telecharger"
        :href="preuve.url"
        download
      >
        Télécharger
      </CzButton>
    </template>

    <template v-else-if="preuve.type === 'pdf'">
      <a
        class="cz-proof cz-proof--pdf"
        :href="preuve.url"
        target="_blank"
        rel="noopener"
        :aria-label="`Ouvrir ${preuve.nomFichier}`"
      >
        <span class="glyph"><CzIcon nom="contrat" /></span>
        <span class="preuve__nom">{{ preuve.nomFichier }} · p.1</span>
      </a>
      <CzButton
        variante="secondaire"
        taille="sm"
        :href="preuve.url"
        target="_blank"
        rel="noopener"
      >
        Ouvrir le PDF
      </CzButton>
    </template>

    <div
      v-if="reference"
      class="preuve__ref"
      :class="{ 'is-seule': preuve.type === 'reference' }"
    >
      <div class="cz-ref">
        <span class="cz-muted preuve__ref-libelle">Réf.</span>
        <span class="cz-mono">{{ reference }}</span>
        <CzButton
          variante="icone"
          taille="sm"
          :icone="copie ? 'coche' : 'copier'"
          :label="copie ? 'Copié' : 'Copier'"
          @click="copier(reference ?? '')"
        />
      </div>
      <div
        v-if="detail"
        class="cz-help"
      >
        {{ detail }}
      </div>
    </div>

    <CzOverlay
      v-if="preuve.type === 'image'"
      :ouvert="pleinEcran"
      position="centre"
      @fermer="pleinEcran = false"
    >
      <div
        class="preuve__plein"
        role="dialog"
        aria-modal="true"
        :aria-label="`Preuve ${preuve.nomFichier}`"
      >
        <div class="preuve__outils">
          <CzButton
            variante="icone"
            label="Réduire"
            :disabled="zoom <= 0.5"
            @click="zoom = Math.max(0.5, zoom - 0.25)"
          >
            −
          </CzButton>
          <CzButton
            variante="icone"
            label="Agrandir"
            :disabled="zoom >= 3"
            @click="zoom = Math.min(3, zoom + 0.25)"
          >
            +
          </CzButton>
          <CzButton
            variante="icone"
            icone="historique"
            label="Pivoter"
            @click="rotation = (rotation + 90) % 360"
          />
          <CzButton
            variante="icone"
            icone="fermer"
            label="Fermer"
            @click="pleinEcran = false"
          />
        </div>
        <div class="preuve__scene">
          <img
            :src="preuve.url"
            :alt="`Preuve de paiement ${preuve.nomFichier}`"
            :style="{ transform: `scale(${zoom}) rotate(${rotation}deg)` }"
          >
        </div>
      </div>
    </CzOverlay>
  </div>
</template>

<style scoped>
.preuve {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
}

.preuve:has(.preuve__ref.is-seule) {
  display: flex;
}

.cz-proof {
  font: inherit;
  font-size: 11px;
  color: var(--text-muted);
  text-decoration: none;
}

.cz-proof:hover,
.cz-proof:focus-visible {
  outline: none;
  box-shadow: var(--shadow-hover);
}

.glyph--survol {
  display: none;
}

.cz-proof:hover .glyph--repos,
.cz-proof:focus-visible .glyph--repos {
  display: none;
}

.cz-proof:hover .glyph--survol,
.cz-proof:focus-visible .glyph--survol {
  display: inline-flex;
}

.preuve__nom {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preuve__ref {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  width: 100%;
  max-width: 320px;
}

.preuve__ref-libelle {
  font-size: 12px;
}

.preuve__plein {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  width: min(960px, 100%);
  height: min(90dvh, 100%);
}

.preuve__outils {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.preuve__scene {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  border-radius: var(--r-card);
  background: var(--surface);
}

.preuve__scene img {
  max-width: 100%;
  max-height: 100%;
  transition: transform .15s ease;
}
</style>
