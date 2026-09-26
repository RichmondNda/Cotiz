<!--
  Badge de statut : toujours un libellé texte, la couleur seule ne porte jamais l'information.
  Tons : success · warning · danger · info · neutral (défaut) · brand (identité : « Fonds d'entrée », plan).
  Pour un statut métier, préférer <BadgeStatut> qui applique la table de correspondance.
-->
<script setup lang="ts">
import type { NomIcone } from '~/utils/icons'

export type TonBadge = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'brand'

withDefaults(defineProps<{
  ton?: TonBadge
  point?: boolean
  petit?: boolean
  icone?: NomIcone
}>(), { ton: 'neutral', point: false, petit: false, icone: undefined })
</script>

<template>
  <span
    class="cz-badge"
    :class="[ton !== 'neutral' && `cz-badge--${ton}`, petit && 'cz-badge--sm']"
  >
    <span
      v-if="point"
      class="dot"
      aria-hidden="true"
    />
    <CzIcon
      v-if="icone"
      :nom="icone"
      :taille="14"
    />
    <slot />
  </span>
</template>
