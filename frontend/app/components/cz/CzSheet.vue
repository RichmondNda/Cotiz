<!--
  Feuille basse (mobile) : r-sheet 20 en haut, poignée, titre, contenu, actions pleine largeur en bas.
  Options de choix : utiliser `.opt` dans le slot (lignes de 44 px min.).
-->
<script setup lang="ts">
withDefaults(defineProps<{
  titre?: string
  fermable?: boolean
}>(), { titre: undefined, fermable: true })

const ouvert = defineModel<boolean>('ouvert', { default: false })
const idTitre = `cz-sheet-${useId()}`
</script>

<template>
  <CzOverlay
    :ouvert="ouvert"
    position="bas"
    :fermable="fermable"
    @fermer="ouvert = false"
  >
    <div
      class="cz-sheet cz-sheet-plein"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="titre ? idTitre : undefined"
    >
      <div
        class="grip"
        aria-hidden="true"
      />
      <h2
        v-if="titre"
        :id="idTitre"
        class="ttl"
      >
        {{ titre }}
      </h2>
      <div class="cz-sheet__corps">
        <slot />
      </div>
      <div
        v-if="$slots.pied"
        class="cz-sheet__pied"
      >
        <slot name="pied" />
      </div>
    </div>
  </CzOverlay>
</template>

<style scoped>
.cz-sheet-plein {
  width: 100%;
  max-height: calc(100dvh - var(--space-12));
  display: flex;
  flex-direction: column;
  padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
}

.ttl {
  margin: 0 0 var(--space-2);
  color: var(--text-strong);
}

.cz-sheet__corps {
  overflow-y: auto;
  font-size: 14px;
  color: var(--text-muted);
}

.cz-sheet__pied {
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-2);
  margin-top: var(--space-4);
}

.cz-sheet__pied :deep(.cz-btn) {
  width: 100%;
  min-height: 44px;
}
</style>
