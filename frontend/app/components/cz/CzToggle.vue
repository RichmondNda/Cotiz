<!-- Interrupteur : uniquement pour les réglages à effet immédiat (notifications, relances). -->
<script setup lang="ts">
withDefaults(defineProps<{
  disabled?: boolean
  label?: string
}>(), { disabled: false, label: undefined })

const modele = defineModel<boolean>({ default: false })
</script>

<template>
  <label
    class="cz-check"
    :class="{ 'is-disabled': disabled }"
  >
    <input
      v-model="modele"
      type="checkbox"
      role="switch"
      class="sr-only"
      :disabled="disabled"
      :aria-checked="modele"
      :aria-label="$slots.default ? undefined : label"
    >
    <span
      class="cz-toggle"
      :class="{ 'is-on': modele, 'is-disabled': disabled }"
      aria-hidden="true"
    />
    <slot />
  </label>
</template>

<style scoped>
input:focus-visible + .cz-toggle {
  box-shadow: var(--focus-ring);
}
</style>
