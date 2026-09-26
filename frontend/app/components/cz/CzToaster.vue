<!-- Pile de toasts de l'application (montée une fois dans app.vue). Bas droite desktop, haut mobile. -->
<script setup lang="ts">
import { useToast, type Toast } from '~/composables/useToast'

const { toasts, retirer } = useToast()
const minuteurs = new Map<number, { reste: number, debut: number, id?: ReturnType<typeof setTimeout> }>()

function demarrer(t: Toast) {
  const m = minuteurs.get(t.id) ?? { reste: t.duree, debut: 0 }
  m.debut = Date.now()
  m.id = setTimeout(() => fermer(t.id), m.reste)
  minuteurs.set(t.id, m)
}
function pause(t: Toast) {
  const m = minuteurs.get(t.id)
  if (!m) return
  clearTimeout(m.id)
  m.reste -= Date.now() - m.debut
}
function fermer(id: number) {
  clearTimeout(minuteurs.get(id)?.id)
  minuteurs.delete(id)
  retirer(id)
}
function agir(t: Toast) {
  t.action?.rappel()
  fermer(t.id)
}

watch(toasts, (liste) => {
  if (!import.meta.client) return
  liste.filter(t => !minuteurs.has(t.id)).forEach(demarrer)
}, { immediate: true, deep: true })
onBeforeUnmount(() => minuteurs.forEach(m => clearTimeout(m.id)))
</script>

<template>
  <!-- Rendu client uniquement : plusieurs Teleport vers #teleports provoquent un décalage d'hydratation. -->
  <ClientOnly>
    <Teleport to="#teleports">
      <TransitionGroup
        tag="div"
        name="cz-toast"
        class="cz-toaster"
        aria-live="polite"
      >
        <CzToast
          v-for="t in toasts"
          :key="t.id"
          :ton="t.ton"
          :titre="t.titre"
          :message="t.message"
          :action="t.action?.label"
          :icone="t.icone"
          @action="agir(t)"
          @mouseenter="pause(t)"
          @mouseleave="demarrer(t)"
          @focusin="pause(t)"
          @focusout="demarrer(t)"
        />
      </TransitionGroup>
    </Teleport>
  </ClientOnly>
</template>

<style scoped>
.cz-toaster {
  position: fixed;
  right: var(--space-6);
  bottom: var(--space-6);
  z-index: 200;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: flex-end;
  pointer-events: none;
}

.cz-toaster > * {
  pointer-events: auto;
}

.cz-toast-enter-active,
.cz-toast-leave-active {
  transition: opacity .2s ease, transform .2s ease;
}

.cz-toast-enter-from,
.cz-toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (max-width: 767px) {
  .cz-toaster {
    top: var(--space-3);
    right: var(--space-3);
    bottom: auto;
    left: var(--space-3);
    align-items: stretch;
  }

  .cz-toaster :deep(.cz-toast) {
    min-width: 0;
  }

  .cz-toast-enter-from,
  .cz-toast-leave-to {
    transform: translateY(-8px);
  }
}
</style>
