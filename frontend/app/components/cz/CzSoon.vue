<!-- Fonction à venir (V2) : badge « Bientôt disponible ». -->
<script setup lang="ts">
withDefaults(defineProps<{ petit?: boolean }>(), { petit: false })
</script>

<template>
  <span
    class="cz-soon"
    :class="{ 'is-sm': petit }"
  ><slot>Bientôt disponible</slot></span>
</template>

<style scoped>
.cz-soon.is-sm {
  font-size: 11px;
  padding: 1px var(--space-2);
}
</style>
