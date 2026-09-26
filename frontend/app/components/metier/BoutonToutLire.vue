<!--
  « Tout lire » : action texte de l'en-tête mobile des notifications (souscripteur, gestionnaire). Cible de 44 px.
-->
<script setup lang="ts">
withDefaults(defineProps<{ envoi?: boolean }>(), { envoi: false })
defineEmits<{ click: [] }>()
</script>

<template>
  <button
    type="button"
    class="tout-lire"
    :disabled="envoi"
    :aria-busy="envoi || undefined"
    @click="$emit('click')"
  >
    Tout lire
  </button>
</template>

<style scoped>
.tout-lire {
  min-height: 44px;
  padding: 0 var(--space-2);
  border: 0;
  background: transparent;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 500;
  color: var(--brand-dark);
  cursor: pointer;
}

.tout-lire:disabled {
  color: var(--text-disabled);
  cursor: default;
}

.tout-lire:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
  border-radius: var(--r-sm);
}
</style>
