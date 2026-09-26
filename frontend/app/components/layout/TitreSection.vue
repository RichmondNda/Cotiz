<!-- Titre de section d'un écran (« Mes projets », « Derniers mouvements ») avec un lien facultatif à droite. -->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

withDefaults(defineProps<{
  titre: string
  lien?: { label: string, to: RouteLocationRaw }
  /** Niveau de titre (h2 par défaut). */
  niveau?: 'h2' | 'h3'
}>(), { lien: undefined, niveau: 'h2' })
</script>

<template>
  <div class="titre-section">
    <component
      :is="niveau"
      class="titre-section__titre"
    >
      {{ titre }}
    </component>
    <NuxtLink
      v-if="lien"
      :to="lien.to"
      class="titre-section__lien"
    >
      {{ lien.label }}
    </NuxtLink>
  </div>
</template>

<style scoped>
.titre-section {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
}

.titre-section__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.titre-section__lien {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
}

.titre-section__lien:hover {
  color: var(--text-strong);
}

.titre-section__lien:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--r-xs);
}
</style>
