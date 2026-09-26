<!--
  Barre d'action fixe en bas d'écran, mobile uniquement (< 768 px) : parcours en plusieurs étapes
  (création de projet, onboarding). Bouton « étape précédente » optionnel (icône, 56 px), puis l'action
  principale en pleine largeur, à portée de pouce (slot). La page réserve l'espace en bas (≈ 96 px).
-->
<script setup lang="ts">
withDefaults(defineProps<{
  /** Affiche le bouton « étape précédente ». */
  precedent?: boolean
}>(), { precedent: false })

defineEmits<{ precedent: [] }>()
</script>

<template>
  <div class="barre-mobile cz-mobile">
    <CzButton
      v-if="precedent"
      variante="secondaire"
      icone="chevron-gauche"
      label="Étape précédente"
      class="barre-mobile__precedent"
      @click="$emit('precedent')"
    />
    <slot />
  </div>
</template>

<style scoped>
.barre-mobile {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 25;
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4) calc(20px + env(safe-area-inset-bottom));
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.barre-mobile__precedent {
  flex: 0 0 56px;
  height: 48px;
}

.barre-mobile > :slotted(*) {
  flex: 1;
  height: 48px;
}
</style>
