<!--
  Barre « Modifications non enregistrées » (Annuler / Enregistrer), fixée en bas de l'écran dès qu'un champ change.
  Desktop : pleine largeur à droite de la barre latérale, texte à gauche. Mobile : au-dessus de la navigation basse,
  deux boutons de même largeur (cibles de 48 px), sans texte.
-->
<script setup lang="ts">
withDefaults(defineProps<{
  envoi?: boolean
}>(), { envoi: false })

defineEmits<{ annuler: [], enregistrer: [] }>()
</script>

<template>
  <div
    class="barre-modifs"
    role="region"
    aria-label="Modifications non enregistrées"
  >
    <b class="barre-modifs__texte cz-desktop">Modifications non enregistrées</b>
    <CzButton
      variante="fantome"
      :disabled="envoi"
      @click="$emit('annuler')"
    >
      Annuler
    </CzButton>
    <CzButton
      :chargement="envoi"
      libelle-chargement="Enregistrement…"
      @click="$emit('enregistrer')"
    >
      Enregistrer
    </CzButton>
  </div>
</template>

<style scoped>
.barre-modifs {
  position: fixed;
  right: 0;
  bottom: 0;
  left: var(--sidebar);
  z-index: 30;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 14px var(--space-8);
  border-top: 1px solid var(--border);
  background: var(--surface);
}

.barre-modifs__texte {
  flex: 1;
  font-size: 14px;
  color: var(--text-strong);
}

@media (max-width: 1023px) {
  .barre-modifs {
    left: var(--sidebar-collapsed);
  }
}

@media (max-width: 767px) {
  /* Au-dessus de la navigation basse (48 px d'entrées + marges + bordure). */
  .barre-modifs {
    left: 0;
    bottom: calc(var(--space-2) + 48px + var(--space-3) + 1px + env(safe-area-inset-bottom));
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
  }

  .barre-modifs > :deep(.cz-btn) {
    flex: 1;
    height: 48px;
  }
}
</style>
