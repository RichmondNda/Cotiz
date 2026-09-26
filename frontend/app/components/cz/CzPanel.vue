<!--
  Panneau latéral 480 px depuis la droite sur voile `overlay` ; plein écran depuis le bas sur mobile.
  Slots : défaut (corps), `pied` (actions).
-->
<script setup lang="ts">
import { useBreakpoint } from '~/composables/useBreakpoint'

withDefaults(defineProps<{
  titre: string
  fermable?: boolean
}>(), { fermable: true })

const ouvert = defineModel<boolean>('ouvert', { default: false })
const { estMobile } = useBreakpoint()
const idTitre = `cz-panel-${useId()}`
</script>

<template>
  <CzOverlay
    :ouvert="ouvert"
    :position="estMobile ? 'bas' : 'droite'"
    :fermable="fermable"
    @fermer="ouvert = false"
  >
    <aside
      class="cz-panel cz-panel-plein"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="idTitre"
    >
      <div class="ph">
        <h2 :id="idTitre">
          {{ titre }}
        </h2>
        <CzButton
          v-if="fermable"
          variante="icone"
          taille="sm"
          icone="fermer"
          label="Fermer"
          @click="ouvert = false"
        />
      </div>
      <div class="pb">
        <slot />
      </div>
      <div
        v-if="$slots.pied"
        class="pf"
      >
        <slot name="pied" />
      </div>
    </aside>
  </CzOverlay>
</template>

<style scoped>
.cz-panel-plein {
  height: 100%;
}

.ph h2 {
  margin: 0;
  font: inherit;
  color: var(--text-strong);
}

.pb {
  flex: 1;
  overflow-y: auto;
}

@media (max-width: 767px) {
  .cz-panel-plein {
    width: 100%;
    height: 100dvh;
    border-radius: 0;
  }

  .pf {
    padding-bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
  }

  .pf :deep(.cz-btn) {
    flex: 1;
    min-height: 44px;
  }
}
</style>
