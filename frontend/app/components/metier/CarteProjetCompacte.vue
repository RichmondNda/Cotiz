<!--
  Carte projet compacte (tableau de bord gestionnaire, mobile) : nom, point d'attention, barre, montants.
  Toute la carte mène au détail du projet.
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

withDefaults(defineProps<{
  nom: string
  alerte?: { texte: string, ton: 'danger' | 'warning' | 'info' }
  progression: number
  gauche: string
  droite?: string
  to: RouteLocationRaw
}>(), { alerte: undefined, droite: undefined })
</script>

<template>
  <NuxtLink
    :to="to"
    class="cz-card carte-compacte"
  >
    <div class="carte-compacte__ligne">
      <b class="carte-compacte__nom">{{ nom }}</b>
      <CzBadge
        v-if="alerte"
        :ton="alerte.ton"
        petit
      >
        {{ alerte.texte }}
      </CzBadge>
    </div>
    <CzProgress
      :valeur="progression"
      :label="gauche"
    />
    <div class="carte-compacte__ligne carte-compacte__montants">
      <span>{{ gauche }}</span><span v-if="droite">{{ droite }}</span>
    </div>
  </NuxtLink>
</template>

<style scoped>
.carte-compacte {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  color: inherit;
  text-decoration: none;
}

.carte-compacte:focus-visible {
  outline: none;
  box-shadow: var(--shadow), 0 0 0 3px var(--brand);
}

.carte-compacte__ligne {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.carte-compacte__nom {
  font-family: var(--font-display);
  font-weight: 600;
  color: var(--text-strong);
}

.carte-compacte__montants {
  font-size: 12.5px;
  color: var(--text-muted);
}
</style>
