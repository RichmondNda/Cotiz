<!--
  État vide, erreur ou fonction à venir.
  Premier usage : ton brand + action. Vide positif (« Rien à valider ») : ton success.
  Vide de recherche : ton neutral + « Effacer la recherche ». Erreur : ton danger + « Réessayer ».
  Fonction V2 : `bientot` affiche « Bientôt disponible » à la place du titre.
-->
<script setup lang="ts">
import type { NomIcone } from '~/utils/icons'

withDefaults(defineProps<{
  icone: NomIcone
  ton?: 'brand' | 'success' | 'neutral' | 'danger'
  titre?: string
  description?: string
  bientot?: boolean
  /** Sans fond : à l'intérieur d'un tableau ou d'une carte. */
  integre?: boolean
}>(), { ton: 'brand', titre: undefined, description: undefined, bientot: false, integre: false })
</script>

<template>
  <div
    class="cz-empty"
    :class="{ 'is-integre': integre }"
    :role="ton === 'danger' ? 'alert' : undefined"
  >
    <div
      class="i"
      :class="ton !== 'brand' && `i--${ton}`"
    >
      <CzIcon :nom="icone" />
    </div>
    <CzSoon v-if="bientot" />
    <div
      v-if="titre"
      class="t"
    >
      {{ titre }}
    </div>
    <div
      v-if="description || $slots.default"
      class="d"
      :class="{ 'is-apres-soon': bientot }"
    >
      <slot>{{ description }}</slot>
    </div>
    <slot name="action" />
  </div>
</template>

<style scoped>
.cz-empty.is-integre {
  background: transparent;
  box-shadow: none;
}

.d.is-apres-soon {
  margin-top: var(--space-2);
}
</style>
