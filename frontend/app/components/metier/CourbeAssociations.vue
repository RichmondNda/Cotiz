<!--
  Évolution d'un effectif sur 12 mois (SaDashboard : associations actives) : courbe `brand` avec aire légère,
  3 lignes de repère (pas « rond » le plus petit qui couvre les valeurs en deux intervalles : 50 pour le jeu de
  référence), mois abrégés tous les trimestres et au dernier point.
-->
<script setup lang="ts">
import { formatMois } from '~/utils/format'

const props = withDefaults(defineProps<{
  points: { mois: string, valeur: number }[]
  label?: string
}>(), { label: 'Évolution du nombre d’associations actives' })

const L = 560
const BASE = 150
const HAUT = 50
const GAUCHE = 40
const DROITE = 546
const PAS_RONDS = [1, 2, 5]

/** Bornes de l'échelle pour un pas : repère bas au plus au pas, repère haut au-dessus de la plus grande valeur. */
function bornes(pas: number, valeurs: number[]) {
  const min = Math.floor(Math.min(...valeurs, pas) / pas) * pas
  return { pas, min, max: Math.max(min + 2 * pas, Math.ceil(Math.max(...valeurs) / pas) * pas) }
}

/**
 * Plus petit pas 1, 2, 5, 10, 20, 50… dont l'échelle tient en deux intervalles (repère du milieu entier), la courbe
 * au-dessus du repère bas (sauf à zéro).
 */
const echelle = computed(() => {
  const valeurs = props.points.length ? props.points.map(p => p.valeur) : [0]
  for (let puissance = 1; ; puissance *= 10) {
    for (const r of PAS_RONDS) {
      const b = bornes(r * puissance, valeurs)
      if (b.max - b.min === 2 * b.pas && (b.min === 0 || b.min < Math.min(...valeurs))) return b
    }
  }
})
const min = computed(() => echelle.value.min)
const max = computed(() => echelle.value.max)
const y = (v: number) => BASE - ((v - min.value) / (max.value - min.value)) * (BASE - HAUT)
const reperes = computed(() => [min.value, (min.value + max.value) / 2, max.value])

const coords = computed(() => {
  const n = Math.max(1, props.points.length - 1)
  return props.points.map((p, i) => ({ ...p, x: GAUCHE + ((DROITE - GAUCHE) * i) / n, y: y(p.valeur) }))
})
const ligne = computed(() => coords.value.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' '))
const aire = computed(() => {
  const d = coords.value
  return d.length ? `${ligne.value} L${d.at(-1)!.x} ${BASE} L${d[0]!.x} ${BASE} Z` : ''
})
/** Mois affichés : un par trimestre depuis le premier, plus le dernier. */
const etiquettes = computed(() => coords.value.filter((_, i) => i % 3 === 0 || i === coords.value.length - 1)
  .filter((c, i, t) => i === t.length - 1 || t.at(-1)!.x - c.x > 60))
const premier = computed(() => props.points[0]?.valeur)
const dernier = computed(() => coords.value.at(-1))
</script>

<template>
  <svg
    class="courbe"
    :viewBox="`0 0 ${L} 180`"
    width="100%"
    role="img"
    :aria-label="`${label}, de ${premier} à ${dernier?.valeur} en ${points.length} mois`"
  >
    <g
      v-for="(r, i) in reperes"
      :key="r"
    >
      <line
        :class="i === 0 ? 'axe' : 'grille'"
        x1="36"
        :y1="y(r)"
        x2="552"
        :y2="y(r)"
      />
      <text
        x="8"
        :y="y(r) + 3"
      >{{ r }}</text>
    </g>
    <path
      class="aire"
      :d="aire"
    />
    <path
      class="ligne"
      :d="ligne"
    />
    <circle
      v-for="c in coords"
      :key="c.mois"
      class="pt"
      :class="{ 'is-dernier': c === dernier }"
      :cx="c.x"
      :cy="c.y"
      :r="4"
    ><title>{{ formatMois(c.mois) }} : {{ c.valeur }}</title></circle>
    <text
      v-for="c in etiquettes"
      :key="`m-${c.mois}`"
      :x="c.x"
      y="168"
      text-anchor="middle"
    >{{ formatMois(c.mois, 'court') }}</text>
  </svg>
</template>

<style scoped>
.courbe {
  display: block;
}

text {
  font-size: 10px;
  fill: var(--text-muted);
}

.axe {
  stroke: var(--border);
}

.grille {
  stroke: var(--divider);
}

.aire {
  fill: var(--brand);
  opacity: 0.08;
}

.ligne {
  fill: none;
  stroke: var(--brand);
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.pt {
  fill: var(--brand);
  opacity: 0;
}

.pt:hover,
.pt.is-dernier {
  opacity: 1;
}
</style>
