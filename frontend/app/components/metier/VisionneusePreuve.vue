<!--
  Visionneuse de preuve de paiement.
  - image : miniature 120×150, clic = plein écran avec zoom et rotation ; « Télécharger » discret dessous ;
  - pdf : aperçu de la page 1 + « Ouvrir le PDF » ;
  - référence seule : encart avec la référence de transaction en mono et bouton copier.
  `compact` : miniature seule (file de validation).
  `grand` (détail d'un paiement, gestionnaire) : l'image occupe la largeur de la carte (300 px, 200 px en mobile)
  avec ses outils (agrandir, pivoter, télécharger) ; PDF en 160×200 ; la référence seule est expliquée dessous.
-->
<script setup lang="ts">
import type { Preuve } from '~~/types'

const props = withDefaults(defineProps<{
  preuve: Preuve
  /** Ligne d'aide sous la référence (« Mobile money · Orange · 10 sept. 2026 »). */
  detail?: string
  grand?: boolean
  /** Miniature seule, sans « Télécharger » (aperçu de la file de validation). */
  compact?: boolean
}>(), { detail: undefined, grand: false, compact: false })

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
  <div
    class="preuve"
    :class="{ 'preuve--grand': grand }"
  >
    <template v-if="preuve.type === 'image' && grand">
      <div class="preuve__zone">
        <button
          type="button"
          class="preuve__apercu"
          :aria-label="`Agrandir la preuve ${preuve.nomFichier}`"
          @click="ouvrir"
        >
          <CzIcon
            nom="image"
            class="preuve__glyphe"
          />
          <span class="preuve__nom cz-desktop">{{ preuve.nomFichier }}</span>
        </button>
        <div class="preuve__barre cz-desktop">
          <CzButton
            variante="icone"
            taille="sm"
            label="Agrandir"
            @click="ouvrir"
          >
            +
          </CzButton>
          <CzButton
            variante="icone"
            taille="sm"
            label="Pivoter"
            @click="rotation = (rotation + 90) % 360; pleinEcran = true"
          >
            ↻
          </CzButton>
          <CzButton
            variante="icone"
            taille="sm"
            icone="telecharger"
            label="Télécharger"
            :href="preuve.url"
            download
          />
        </div>
      </div>
      <span class="preuve__legende cz-mobile">{{ preuve.nomFichier }} · toucher pour agrandir</span>
    </template>

    <template v-else-if="preuve.type === 'image'">
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
        v-if="!compact"
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
        :class="{ preuve__pdf: grand }"
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
      v-if="reference && !(grand && preuve.type !== 'reference')"
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
      <p
        v-if="grand && preuve.type === 'reference'"
        class="preuve__sans-fichier"
      >
        <span class="cz-desktop">Aucun fichier joint : le souscripteur a indiqué une référence de transaction.</span>
        <span class="cz-mobile">Aucune image jointe : vérifiez la référence dans vos relevés.</span>
      </p>
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

.preuve--grand {
  display: flex;
  width: 100%;
}

.preuve--grand:has(.preuve__pdf) {
  flex-direction: row;
  align-items: flex-end;
  gap: var(--space-4);
}

.preuve--grand .preuve__ref {
  max-width: none;
}

.preuve__zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  width: 100%;
  height: 300px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: linear-gradient(160deg, var(--info-bg), var(--surface-subtle));
}

.preuve__apercu {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2);
  border: 0;
  border-radius: var(--r-field);
  background: none;
  font-size: 13px;
  color: var(--text-muted);
  cursor: zoom-in;
}

.preuve__apercu:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.preuve__glyphe {
  width: 44px;
  height: 44px;
  color: var(--info);
}

.preuve__barre {
  display: flex;
  gap: 6px;
}

.preuve__legende {
  font-size: 12.5px;
  color: var(--text-muted);
}

.preuve__pdf {
  width: 160px;
  height: 200px;
}

.preuve__sans-fichier {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

@media (max-width: 767px) {
  .preuve__zone {
    height: 200px;
  }

  .preuve__apercu {
    width: 100%;
    height: 100%;
  }

  .preuve--grand .preuve__ref-libelle,
  .preuve--grand .preuve__ref .cz-btn {
    display: none;
  }
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
