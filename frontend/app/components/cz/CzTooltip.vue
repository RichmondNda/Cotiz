<!-- Infobulle `cz-tip` : fond text-strong, 12 px, délai 300 ms, au survol et au focus. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  texte: string
  position?: 'haut' | 'bas'
  delai?: number
}>(), { position: 'haut', delai: 300 })

const visible = ref(false)
const id = `cz-tip-${useId()}`
let minuteur: ReturnType<typeof setTimeout> | undefined

function montrer() {
  clearTimeout(minuteur)
  minuteur = setTimeout(() => (visible.value = true), props.delai)
}
function cacher() {
  clearTimeout(minuteur)
  visible.value = false
}
onBeforeUnmount(() => clearTimeout(minuteur))
</script>

<template>
  <span
    class="cz-tooltip"
    :aria-describedby="visible ? id : undefined"
    @mouseenter="montrer"
    @mouseleave="cacher"
    @focusin="montrer"
    @focusout="cacher"
    @keydown.esc="cacher"
  >
    <slot />
    <span
      v-if="visible"
      :id="id"
      role="tooltip"
      class="cz-tip cz-tooltip__bulle"
      :class="`is-${position}`"
    >{{ texte }}</span>
  </span>
</template>

<style scoped>
.cz-tooltip {
  position: relative;
  display: inline-flex;
}

.cz-tooltip__bulle {
  position: absolute;
  left: 50%;
  z-index: 50;
  width: max-content;
  transform: translateX(-50%);
  pointer-events: none;
}

.cz-tooltip__bulle.is-haut {
  bottom: calc(100% + var(--space-2));
}

.cz-tooltip__bulle.is-bas {
  top: calc(100% + var(--space-2));
}
</style>
