<!-- Icône du jeu Cotiz (24 px, trait 1,75). Hérite de currentColor. -->
<script setup lang="ts">
import { ICONES, type NomIcone } from '~/utils/icons'

const props = withDefaults(defineProps<{
  nom: NomIcone
  taille?: number
  /** Libellé accessible ; sans libellé, l'icône est décorative (aria-hidden). */
  label?: string
}>(), { taille: 24, label: undefined })

const contenu = computed(() => ICONES[props.nom] ?? '')
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- chemins SVG statiques du design system -->
  <svg
    class="cz-icon"
    :width="taille"
    :height="taille"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
    v-html="contenu"
  />
</template>
