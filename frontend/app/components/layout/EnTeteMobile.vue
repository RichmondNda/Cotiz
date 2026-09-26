<!--
  En-tête mobile des écrans applicatifs (< 768 px) : retour éventuel, titre, sous-titre, actions (cloche…).
  Bandeau blanc avec filet bas, comme dans les captures mobiles.
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

withDefaults(defineProps<{
  titre: string
  sousTitre?: string
  retour?: RouteLocationRaw
  libelleRetour?: string
}>(), { sousTitre: undefined, retour: undefined, libelleRetour: 'Retour' })
</script>

<template>
  <header class="entete-mobile">
    <NuxtLink
      v-if="retour"
      :to="retour"
      class="entete-mobile__retour"
      :aria-label="libelleRetour"
    >
      <CzIcon nom="chevron-gauche" />
    </NuxtLink>
    <div class="entete-mobile__textes">
      <h1 class="entete-mobile__titre">
        {{ titre }}
      </h1>
      <p
        v-if="sousTitre"
        class="entete-mobile__sous-titre"
      >
        {{ sousTitre }}
      </p>
    </div>
    <div
      v-if="$slots.actions"
      class="entete-mobile__actions"
    >
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.entete-mobile {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 64px;
  padding: var(--space-2) var(--space-4);
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}

.entete-mobile__retour {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  margin-left: calc(-1 * var(--space-3));
  border-radius: var(--r-field);
  color: var(--text-strong);
}

.entete-mobile__retour:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.entete-mobile__textes {
  flex: 1;
  min-width: 0;
}

.entete-mobile__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 19px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--text-strong);
}

.entete-mobile__sous-titre {
  margin: var(--space-1) 0 0;
  font-size: 12.5px;
  color: var(--text-muted);
}

.entete-mobile__actions {
  display: flex;
  gap: var(--space-2);
}
</style>
