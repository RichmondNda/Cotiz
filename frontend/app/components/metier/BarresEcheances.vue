<!--
  Barres simples par échéance (mobile : « Recouvrement par échéance », « Collecté par mois ») :
  part reçue de l'attendu en brand, mois en cours en transparence, échéances à venir en trait gris.
  Étiquettes : sous chaque barre (`etiquettes: 'toutes'`) ou seulement début et fin de période.
-->
<script setup lang="ts">
export interface BarreEcheance {
  label: string
  /** Part reçue, entre 0 et 1. */
  ratio: number
  enCours?: boolean
  aVenir?: boolean
}

const props = withDefaults(defineProps<{
  barres: BarreEcheance[]
  etiquettes?: 'toutes' | 'bornes'
  debut?: string
  fin?: string
  label: string
}>(), { etiquettes: 'bornes', debut: undefined, fin: undefined })

const description = computed(() => props.barres
  .filter(b => !b.aVenir)
  .map(b => `${b.label} : ${Math.round(b.ratio * 100)} %`)
  .join(', '))
</script>

<template>
  <figure class="barres">
    <div
      class="barres__zone"
      role="img"
      :aria-label="`${label}. ${description}`"
    >
      <div
        v-for="(b, i) in barres"
        :key="i"
        class="barres__col"
      >
        <span class="barres__piste">
          <span
            class="barres__barre"
            :class="{ 'is-cours': b.enCours, 'is-futur': b.aVenir }"
            :style="b.aVenir ? undefined : { height: `${Math.max(4, Math.round(b.ratio * 100))}%` }"
          />
        </span>
        <span
          v-if="etiquettes === 'toutes'"
          class="barres__label"
        >{{ b.label }}</span>
      </div>
    </div>
    <figcaption
      v-if="etiquettes === 'bornes' && (debut || fin)"
      class="barres__bornes"
    >
      <span>{{ debut }}</span><span>{{ fin }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.barres {
  margin: 0;
}

.barres__zone {
  display: flex;
  align-items: flex-end;
  gap: var(--space-1);
  height: 120px;
}

.barres__col {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  align-items: stretch;
  gap: 6px;
  height: 100%;
  min-width: 0;
}

.barres__piste {
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  min-height: 0;
}

.barres__barre {
  border-radius: 3px 3px 0 0;
  background: var(--brand);
}

.barres__barre.is-cours {
  opacity: 0.55;
}

.barres__barre.is-futur {
  height: 6px;
  border-radius: 2px;
  background: var(--border);
}

.barres__label {
  font-size: 11px;
  text-align: center;
  color: var(--text-muted);
}

.barres__bornes {
  display: flex;
  justify-content: space-between;
  margin-top: var(--space-2);
  font-size: 12.5px;
  color: var(--text-muted);
}
</style>
