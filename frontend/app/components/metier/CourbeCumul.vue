<!-- Courbe cumulative (souscripteur) : aire légère sous la courbe, objectif restant en pointillé. -->
<script setup lang="ts">
import { formatFCFA } from '~/utils/format'

const props = withDefaults(defineProps<{
  /** Cumul versé à chaque période. */
  points: { label: string, valeur: number }[]
  objectif: number
  label?: string
}>(), { label: 'Cumul versé' })

const L = 230
const H = 110
const M = 10

const coords = computed(() => {
  const n = Math.max(1, props.points.length - 1)
  const top = Math.max(props.objectif, ...props.points.map(p => p.valeur), 1)
  return props.points.map((p, i) => ({
    ...p,
    x: M + ((L - 2 * M) * i) / n,
    y: H - M - ((H - 2 * M) * p.valeur) / top,
  }))
})
const ligne = computed(() => coords.value.map((c, i) => `${i ? 'L' : 'M'}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' '))
const aire = computed(() => {
  const d = coords.value
  if (!d.length) return ''
  return `${ligne.value} L${d[d.length - 1]!.x.toFixed(1)} ${H - M} L${d[0]!.x.toFixed(1)} ${H - M} Z`
})
const dernier = computed(() => coords.value[coords.value.length - 1])
</script>

<template>
  <svg
    class="cum"
    :viewBox="`0 0 ${L} ${H}`"
    width="100%"
    role="img"
    :aria-label="`${label} : ${dernier ? formatFCFA(dernier.valeur) : ''} sur ${formatFCFA(objectif)}`"
  >
    <path
      class="ar"
      :d="aire"
    />
    <path
      class="ln"
      :d="ligne"
    />
    <path
      v-if="dernier"
      class="tg"
      :d="`M${dernier.x} ${dernier.y} L${L - M} ${M}`"
    />
    <circle
      v-for="c in coords"
      :key="c.label"
      class="pt"
      :class="{ 'is-dernier': c === dernier }"
      :cx="c.x"
      :cy="c.y"
      :r="c === dernier ? 4 : 3"
    ><title>{{ c.label }} : {{ formatFCFA(c.valeur) }}</title></circle>
  </svg>
</template>

<style scoped>
.ln { stroke: var(--brand); fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; }
.ar { fill: var(--brand); opacity: .1; }
.tg { stroke: var(--brand); stroke-dasharray: 4 4; opacity: .5; stroke-width: 2; fill: none; }
.pt { fill: var(--brand); opacity: 0; }
.pt:hover, .pt.is-dernier { opacity: 1; }
</style>
