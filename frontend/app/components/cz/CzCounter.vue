<!-- Compteur pour les petites quantités entières (nombre de souscripteurs requis). -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  min?: number
  max?: number
  pas?: number
  label?: string
  disabled?: boolean
}>(), { min: 0, max: Number.POSITIVE_INFINITY, pas: 1, label: undefined, disabled: false })

const modele = defineModel<number>({ required: true })
const focus = ref(false)

function changer(delta: number) {
  modele.value = Math.min(props.max, Math.max(props.min, modele.value + delta))
}
function surTouche(e: KeyboardEvent) {
  if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
    e.preventDefault()
    changer(props.pas)
  }
  else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
    e.preventDefault()
    changer(-props.pas)
  }
}
</script>

<template>
  <div
    class="cz-counter"
    :class="{ 'is-focus': focus }"
    role="group"
    :aria-label="label"
  >
    <CzButton
      variante="icone"
      taille="sm"
      label="Diminuer"
      :disabled="disabled || modele <= min"
      @click="changer(-pas)"
    >
      −
    </CzButton>
    <b
      role="spinbutton"
      tabindex="0"
      :aria-valuenow="modele"
      :aria-valuemin="min"
      :aria-valuemax="Number.isFinite(max) ? max : undefined"
      :aria-label="label"
      @keydown="surTouche"
      @focus="focus = true"
      @blur="focus = false"
    >{{ modele }}</b>
    <CzButton
      variante="icone"
      taille="sm"
      label="Augmenter"
      :disabled="disabled || modele >= max"
      @click="changer(pas)"
    >
      +
    </CzButton>
  </div>
</template>

<style scoped>
b:focus-visible {
  outline: none;
}
</style>
