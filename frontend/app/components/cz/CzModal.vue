<!--
  Modale : confirmation 420 px (`sm`) ou formulaire 560 px (`md`).
  Titre = question explicite qui nomme l'objet ; bouton = le verbe (jamais « OK »).
  Sous 768 px, bascule automatiquement en feuille basse (CzSheet), comme dans les captures mobiles.
  Slots : défaut (corps), `pied` (actions, primaire en dernier).
-->
<script setup lang="ts">
import { useBreakpoint } from '~/composables/useBreakpoint'

const props = withDefaults(defineProps<{
  titre: string
  taille?: 'sm' | 'md'
  fermable?: boolean
  /** Désactive la bascule en feuille basse sur mobile. */
  sansFeuille?: boolean
}>(), { taille: 'sm', fermable: true, sansFeuille: false })

const ouvert = defineModel<boolean>('ouvert', { default: false })
const { estMobile } = useBreakpoint()
const idTitre = `cz-modal-${useId()}`
const enFeuille = computed(() => estMobile.value && !props.sansFeuille)
</script>

<template>
  <CzSheet
    v-if="enFeuille"
    v-model:ouvert="ouvert"
    :titre="titre"
    :fermable="fermable"
  >
    <slot />
    <template
      v-if="$slots.pied"
      #pied
    >
      <slot name="pied" />
    </template>
  </CzSheet>
  <CzOverlay
    v-else
    :ouvert="ouvert"
    position="centre"
    :fermable="fermable"
    @fermer="ouvert = false"
  >
    <div
      class="cz-modal"
      :class="{ 'cz-modal--md': taille === 'md' }"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="idTitre"
    >
      <div class="mh">
        <h2 :id="idTitre">
          {{ titre }}
        </h2>
        <button
          v-if="fermable"
          type="button"
          class="cz-modal__fermer"
          aria-label="Fermer"
          @click="ouvert = false"
        >
          <CzIcon nom="fermer" />
        </button>
      </div>
      <div class="mb">
        <slot />
      </div>
      <div
        v-if="$slots.pied"
        class="mf"
      >
        <slot name="pied" />
      </div>
    </div>
  </CzOverlay>
</template>

<style scoped>
.cz-modal {
  max-height: calc(100dvh - var(--space-8));
  display: flex;
  flex-direction: column;
}

.mh h2 {
  margin: 0;
  font: inherit;
}

.mb {
  overflow-y: auto;
}

.cz-modal__fermer {
  display: inline-flex;
  flex-shrink: 0;
  align-self: flex-start;
  padding: 0;
  border: 0;
  border-radius: var(--r-xs);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.cz-modal__fermer:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}
</style>
