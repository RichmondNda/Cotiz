<!--
  Aperçu « Ce que verra le souscripteur » (onboarding, étape 3) : bloc « Comment payer <association> »
  avec les moyens retenus et leurs coordonnées, sur fond corail (thème member). Mis à jour en direct.
-->
<script setup lang="ts">
defineProps<{
  association: string
  moyens: { libelle: string, valeur: string }[]
}>()
</script>

<template>
  <aside
    class="apercu-cp"
    data-theme="member"
    aria-label="Ce que verra le souscripteur"
  >
    <div class="apercu-cp__titre">
      Ce que verra le souscripteur
    </div>
    <div class="apercu-cp__carte">
      <b class="apercu-cp__nom">Comment payer {{ association }}</b>
      <div
        v-for="m in moyens"
        :key="m.libelle"
        class="apercu-cp__moyen"
      >
        <b>{{ m.libelle }}</b>
        <span
          v-if="m.valeur"
          class="cz-mono apercu-cp__valeur"
        >{{ m.valeur }}</span>
      </div>
      <span class="apercu-cp__rappel">Après votre versement, déclarez-le dans Cotiz avec une preuve.</span>
    </div>
  </aside>
</template>

<style scoped>
.apercu-cp {
  align-self: start;
  padding: 18px;
  border-radius: var(--r-card);
  background: var(--page);
}

.apercu-cp__titre {
  margin-bottom: var(--space-3);
  font-family: var(--font-display);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--brand-dark);
}

.apercu-cp__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 14px;
  border-radius: var(--r-tile);
  background: var(--surface);
  font-size: 13px;
}

.apercu-cp__nom {
  font-family: var(--font-display);
  font-size: 14px;
  color: var(--text-strong);
}

.apercu-cp__moyen {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--divider-row);
}

.apercu-cp__valeur,
.apercu-cp__rappel {
  color: var(--text-muted);
  overflow-wrap: anywhere;
}
</style>
