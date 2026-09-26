<!-- Barre de progression 8 px, r-pill. brand (défaut) · info (remplissage) · danger · success · muted (terminé). -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  valeur: number
  ton?: 'brand' | 'info' | 'danger' | 'success' | 'warning' | 'muted'
  label?: string
}>(), { ton: 'brand', label: undefined })

const borne = computed(() => Math.max(0, Math.min(100, props.valeur)))
</script>

<template>
  <div
    class="cz-bar"
    :class="ton !== 'brand' && `cz-bar--${ton}`"
    role="progressbar"
    :aria-valuenow="Math.round(borne)"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-label="label"
  >
    <i :style="{ width: `${borne}%` }" />
  </div>
</template>

<style scoped>
/* Quota proche de la limite (abonnement : au-delà de 80 %). Pas de variante warning dans le DS. */
.cz-bar--warning i {
  background: var(--warning);
}
</style>
