<!--
  Socle des superpositions (modale, feuille basse, panneau latéral, tiroir) : téléportation dans <body>,
  voile `overlay`, focus piégé, Échap, retour du focus au déclencheur, défilement de la page bloqué.
  Usage interne : préférer CzModal, CzSheet, CzPanel.
-->
<script setup lang="ts">
import { useFocusTrap } from '~/composables/useFocusTrap'
import { useScrollLock } from '~/composables/useScrollLock'

const props = withDefaults(defineProps<{
  ouvert: boolean
  position?: 'centre' | 'bas' | 'droite' | 'gauche'
  fermable?: boolean
}>(), { position: 'centre', fermable: true })

const emit = defineEmits<{ fermer: [] }>()

const conteneur = ref<HTMLElement | null>(null)
const ouvert = computed(() => props.ouvert)

function fermer() {
  if (props.fermable) emit('fermer')
}

useFocusTrap(conteneur, ouvert, fermer)
useScrollLock(ouvert)
</script>

<template>
  <Teleport to="#teleports">
    <Transition :name="`cz-overlay-${position}`">
      <div
        v-if="ouvert"
        ref="conteneur"
        class="cz-overlay"
        :class="`cz-overlay--${position}`"
        tabindex="-1"
        @click.self="fermer"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cz-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  background: var(--overlay);
  outline: none;
}

.cz-overlay--centre {
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}

.cz-overlay--bas {
  align-items: flex-end;
  justify-content: center;
}

.cz-overlay--droite {
  justify-content: flex-end;
}

.cz-overlay--gauche {
  justify-content: flex-start;
}

/* Transitions */
[class*="cz-overlay-"][class*="-enter-active"],
[class*="cz-overlay-"][class*="-leave-active"] {
  transition: opacity .18s ease;
}

[class*="cz-overlay-"][class*="-enter-active"] > *,
[class*="cz-overlay-"][class*="-leave-active"] > * {
  transition: transform .22s ease;
}

[class*="cz-overlay-"][class*="-enter-from"],
[class*="cz-overlay-"][class*="-leave-to"] {
  opacity: 0;
}

.cz-overlay-centre-enter-from > *,
.cz-overlay-centre-leave-to > * {
  transform: translateY(8px) scale(.98);
}

.cz-overlay-bas-enter-from > *,
.cz-overlay-bas-leave-to > * {
  transform: translateY(100%);
}

.cz-overlay-droite-enter-from > *,
.cz-overlay-droite-leave-to > * {
  transform: translateX(100%);
}

.cz-overlay-gauche-enter-from > *,
.cz-overlay-gauche-leave-to > * {
  transform: translateX(-100%);
}

@media (prefers-reduced-motion: reduce) {
  [class*="cz-overlay-"] > * {
    transition: none !important;
  }
}
</style>
