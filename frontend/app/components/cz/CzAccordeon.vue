<!--
  Volet dépliable `cz-acc` : question/titre cliquable (chevron qui pivote), contenu affiché quand ouvert.
  Usage : FAQ de la landing, sommaire des pages légales en mobile. `v-model:ouvert` pour piloter l'ouverture.
-->
<script setup lang="ts">
defineProps<{
  titre: string
}>()

const ouvert = defineModel<boolean>('ouvert', { default: false })
const id = `cz-acc-${useId()}`
</script>

<template>
  <div
    class="cz-acc"
    :class="{ 'is-open': ouvert }"
  >
    <h3 class="cz-acc__titre">
      <button
        type="button"
        class="q"
        :aria-expanded="ouvert"
        :aria-controls="id"
        @click="ouvert = !ouvert"
      >
        <span>{{ titre }}</span><CzIcon nom="chevron-bas" />
      </button>
    </h3>
    <div
      v-show="ouvert"
      :id="id"
      class="a"
    >
      <slot />
    </div>
  </div>
</template>

<style scoped>
.cz-acc__titre {
  margin: 0;
  font: inherit;
}

.q {
  gap: var(--space-3);
  width: 100%;
  min-height: 52px;
  border: 0;
  background: transparent;
  font-family: var(--font-text);
  font-size: 14.5px;
  text-align: left;
}

.q:focus-visible {
  outline: none;
  border-radius: var(--r-md);
  box-shadow: var(--focus-ring);
}

.q .cz-icon {
  flex-shrink: 0;
  transition: transform .2s;
}

.a {
  font-size: 14px;
  line-height: 1.6;
}
</style>
