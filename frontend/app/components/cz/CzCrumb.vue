<!-- Fil d'Ariane : liens intermédiaires, élément courant en `text`. -->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  elements: { label: string, to?: RouteLocationRaw }[]
}>()
</script>

<template>
  <nav
    class="cz-crumb"
    aria-label="Fil d'Ariane"
  >
    <template
      v-for="(e, i) in elements"
      :key="i"
    >
      <CzIcon
        v-if="i > 0"
        nom="chevron-droite"
      />
      <span
        v-if="i === elements.length - 1"
        class="cur"
        aria-current="page"
      >{{ e.label }}</span>
      <NuxtLink
        v-else-if="e.to"
        :to="e.to"
        class="cz-crumb__lien"
      >{{ e.label }}</NuxtLink>
      <span v-else>{{ e.label }}</span>
    </template>
  </nav>
</template>

<style scoped>
.cz-crumb__lien {
  color: inherit;
  text-decoration: none;
}

.cz-crumb__lien:hover {
  color: var(--text);
}
</style>
