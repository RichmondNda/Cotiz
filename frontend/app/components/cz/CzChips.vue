<!-- Groupe de puces de filtre à choix unique (« Tous · 52 », « En retard · 14 »…). -->
<script setup lang="ts" generic="V extends string | number">
defineProps<{
  options: { valeur: V, label: string, compteur?: number | string }[]
  label?: string
}>()

const modele = defineModel<V>({ required: true })
</script>

<template>
  <div
    class="cz-chips"
    role="group"
    :aria-label="label"
  >
    <CzChip
      v-for="o in options"
      :key="String(o.valeur)"
      :actif="o.valeur === modele"
      @click="modele = o.valeur"
    >
      {{ o.label }}<template v-if="o.compteur !== undefined">
        · {{ o.compteur }}
      </template>
    </CzChip>
    <slot />
  </div>
</template>

<style scoped>
.cz-chips {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
}
</style>
