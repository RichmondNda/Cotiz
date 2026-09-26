<!-- Puce de filtre. Active : fond brand-pale ; `retirable` affiche une croix. -->
<script setup lang="ts">
import type { NomIcone } from '~/utils/icons'

withDefaults(defineProps<{
  actif?: boolean
  disabled?: boolean
  icone?: NomIcone
  retirable?: boolean
}>(), { actif: false, disabled: false, icone: undefined, retirable: false })

defineEmits<{ click: [MouseEvent], retirer: [] }>()
</script>

<template>
  <button
    type="button"
    class="cz-chip"
    :class="{ 'is-on': actif, 'is-disabled': disabled }"
    :disabled="disabled"
    :aria-pressed="actif"
    @click="$emit('click', $event)"
  >
    <CzIcon
      v-if="icone"
      :nom="icone"
    />
    <slot />
    <span
      v-if="retirable"
      class="cz-chip__retirer"
      role="button"
      aria-label="Retirer le filtre"
      @click.stop="$emit('retirer')"
    ><CzIcon nom="fermer" /></span>
  </button>
</template>

<style scoped>
.cz-chip {
  font-family: var(--font-text);
}

.cz-chip:focus-visible {
  outline: none;
  border-color: var(--brand);
  box-shadow: var(--focus-ring);
}

.cz-chip__retirer {
  display: inline-flex;
}
</style>
