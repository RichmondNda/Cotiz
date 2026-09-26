<!-- Compteur d'onglet ou de menu. warning (défaut) = action en attente · neutral = simple total · danger = non lues. -->
<script setup lang="ts">
withDefaults(defineProps<{
  valeur: number | string
  ton?: 'warning' | 'neutral' | 'danger'
}>(), { ton: 'warning' })
</script>

<template>
  <span
    class="cz-count"
    :class="ton !== 'warning' && `cz-count--${ton}`"
  >{{ valeur }}</span>
</template>
