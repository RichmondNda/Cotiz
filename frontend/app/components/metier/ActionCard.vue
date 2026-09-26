<!-- Carte d'action (pointillé warning) : une par contrat à signer. Toute la carte est un lien. -->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { NomIcone } from '~/utils/icons'

withDefaults(defineProps<{
  titre: string
  description?: string
  icone?: NomIcone
  to: RouteLocationRaw
}>(), { description: undefined, icone: 'contrat' })
</script>

<template>
  <NuxtLink
    :to="to"
    class="cz-action"
  >
    <span class="ic"><CzIcon :nom="icone" /></span>
    <div>
      <div class="t">{{ titre }}</div>
      <div
        v-if="description"
        class="d"
      >{{ description }}</div>
    </div>
    <span class="chev"><CzIcon nom="chevron-droite" /></span>
  </NuxtLink>
</template>

<style scoped>
.cz-action {
  color: inherit;
  text-decoration: none;
}

.cz-action:focus-visible {
  outline: none;
  box-shadow: var(--shadow), 0 0 0 3px var(--brand);
}
</style>
