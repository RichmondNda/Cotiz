<!-- Case à cocher 20×20 : toute la ligne (`cz-check`) est cliquable. `indetermine` = sélection partielle. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  indetermine?: boolean
  erreur?: boolean
  disabled?: boolean
  label?: string
  name?: string
  value?: string
}>(), { indetermine: false, erreur: false, disabled: false, label: undefined, name: undefined, value: undefined })

const modele = defineModel<boolean>({ default: false })
const coche = computed(() => modele.value || props.indetermine)
</script>

<template>
  <label
    class="cz-check"
    :class="{ 'is-disabled': disabled }"
  >
    <input
      v-model="modele"
      type="checkbox"
      class="sr-only"
      :disabled="disabled"
      :name="name"
      :value="value"
      :aria-label="$slots.default ? undefined : label"
      :aria-invalid="erreur || undefined"
      :indeterminate="indetermine"
    >
    <span
      class="cz-cb"
      :class="{ 'is-on': coche, 'is-error': erreur, 'is-disabled': disabled }"
      aria-hidden="true"
    >
      <CzIcon
        v-if="modele"
        nom="coche"
      />
      <span
        v-else-if="indetermine"
        class="cz-cb__tiret"
      />
    </span>
    <slot />
  </label>
</template>

<style scoped>
input:focus-visible + .cz-cb {
  border-color: var(--brand);
  box-shadow: var(--focus-ring);
}

.cz-cb__tiret {
  width: 10px;
  height: 2px;
  border-radius: var(--r-pill);
  background: currentColor;
}
</style>
