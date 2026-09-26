<!--
  Évolution du taux de recouvrement cumulé après chaque échéance échue (MgProjetRapports) : courbe `brand`,
  repère 100 % en haut, valeur finale étiquetée au dernier point. Chaque point porte son mois et son taux (title).
-->
<script setup lang="ts">
import { formatPourcent } from '~/utils/format'

const props = withDefaults(defineProps<{
  points: { label: string, taux: number }[]
  label?: string
}>(), { label: 'Évolution du taux de recouvrement' })

const L = 300
const H = 150
const HAUT = 20
const BASE = 140
const GAUCHE = 12
const DROITE = 12

/** Échelle de 50 % à 100 % : les écarts de recouvrement restent lisibles. */
const bas = computed(() => Math.min(50, ...props.points.map(p => p.taux)))
const y = (t: number) => BASE - ((t - bas.value) / (100 - bas.value)) * (BASE - HAUT)
const coords = computed(() => {
  const n = Math.max(1, props.points.length - 1)
  return props.points.map((p, i) => ({ ...p, x: GAUCHE + ((L - GAUCHE - DROITE) * i) / n, y: y(p.taux) }))
})
const ligne = computed(() => coords.value.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' '))
const dernier = computed(() => coords.value.at(-1))
</script>

<template>
  <svg
    class="courbe"
    :viewBox="`0 0 ${L} ${H}`"
    width="100%"
    role="img"
    :aria-label="`${label} : ${points.map(p => `${p.label} ${formatPourcent(p.taux)}`).join(', ')}`"
  >
    <line
      class="gl"
      :x1="GAUCHE"
      :x2="L - DROITE"
      :y1="y(100)"
      :y2="y(100)"
    />
    <text
      class="ax"
      :x="GAUCHE"
      :y="y(100) - 4"
    >100 %</text>
    <line
      class="base"
      :x1="GAUCHE"
      :x2="L - DROITE"
      :y1="BASE"
      :y2="BASE"
    />
    <path
      class="ln"
      :d="ligne"
    />
    <circle
      v-for="c in coords"
      :key="c.label"
      class="pt"
      :class="{ 'is-dernier': c === dernier }"
      :cx="c.x"
      :cy="c.y"
      :r="c === dernier ? 4 : 3"
    ><title>{{ c.label }} : {{ formatPourcent(c.taux) }}</title></circle>
    <text
      v-if="dernier"
      class="val"
      text-anchor="end"
      :x="dernier.x"
      :y="dernier.y + 16"
    >{{ formatPourcent(dernier.taux) }}</text>
  </svg>
</template>

<style scoped>
.gl { stroke: var(--divider); }
.base { stroke: var(--border); }
.ln { fill: none; stroke: var(--brand); stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.pt { fill: var(--brand); opacity: 0; }
.pt:hover, .pt.is-dernier { opacity: 1; }

.ax,
.val {
  font-family: var(--font-text);
  font-size: 9px;
  fill: var(--text-muted);
}

.val {
  font-size: 10px;
  fill: var(--text-strong);
}
</style>
