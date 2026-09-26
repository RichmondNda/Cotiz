<!--
  Barres groupées « attendu vs reçu » par mois : attendu en `border`, reçu en `brand`,
  mois en cours en transparence. Montants abrégés sur l'axe (0,5M, 1M), complets dans l'infobulle.
-->
<script setup lang="ts">
import { formatFCFA } from '~/utils/format'

export interface MoisCollecte {
  label: string
  attendu: number
  recu: number
  enCours?: boolean
}

const props = withDefaults(defineProps<{
  mois: MoisCollecte[]
  label?: string
  /** Légende de la série « attendu » (« Attendu 1 300 000 F / mois »). */
  libelleAttendu?: string
}>(), { label: 'Collecte mensuelle, attendu et reçu', libelleAttendu: 'Attendu' })

const L = 340
const H = 150
const BASE = 130
const HAUT = 20
const GAUCHE = 30

function abreger(n: number): string {
  if (n >= 100_000) return `${String(n / 1_000_000).replace('.', ',')}M`
  if (n >= 1_000) return `${String(n / 1_000).replace('.', ',')}k`
  return String(n)
}

const echelle = computed(() => {
  const max = Math.max(1, ...props.mois.flatMap(m => [m.attendu, m.recu]))
  // Pas « rond » : 0,5M si max ≤ 1,5M, sinon 1M…
  const pas = [100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000].find(p => max / p <= 3) ?? 10_000_000
  const top = Math.ceil(max / pas) * pas
  const graduations = Array.from({ length: Math.round(top / pas) + 1 }, (_, i) => i * pas)
  return { top, graduations }
})

const y = (v: number) => BASE - (v / echelle.value.top) * (BASE - HAUT)
const largeurGroupe = computed(() => (L - GAUCHE - 5) / Math.max(1, props.mois.length))
const barre = computed(() => Math.min(16, largeurGroupe.value / 3))

const infobulle = ref<{ x: number, y: number, texte: string } | null>(null)
</script>

<template>
  <figure class="graph">
    <svg
      :viewBox="`0 0 ${L} ${H}`"
      width="100%"
      role="img"
      :aria-label="label"
      @mouseleave="infobulle = null"
    >
      <g
        v-for="g in echelle.graduations"
        :key="g"
      >
        <line
          :class="g === 0 ? 'base' : 'gl'"
          :x1="GAUCHE"
          :x2="L - 5"
          :y1="y(g)"
          :y2="y(g)"
        />
        <text
          class="ax"
          x="0"
          :y="y(g) + 3"
        >{{ abreger(g) }}</text>
      </g>
      <g
        v-for="(m, i) in mois"
        :key="m.label"
        @mouseenter="infobulle = {
          x: GAUCHE + largeurGroupe * i + largeurGroupe / 2,
          y: y(Math.max(m.attendu, m.recu)),
          texte: `${m.label} · attendu ${formatFCFA(m.attendu)} · reçu ${formatFCFA(m.recu)}`,
        }"
      >
        <title>{{ m.label }} : attendu {{ formatFCFA(m.attendu) }}, reçu {{ formatFCFA(m.recu) }}</title>
        <rect
          class="exp"
          :x="GAUCHE + largeurGroupe * i + largeurGroupe / 2 - barre - 1"
          :y="y(m.attendu)"
          :width="barre"
          :height="BASE - y(m.attendu)"
          rx="3"
        />
        <rect
          :class="m.enCours ? 'now' : 'rec'"
          :x="GAUCHE + largeurGroupe * i + largeurGroupe / 2 + 1"
          :y="y(m.recu)"
          :width="barre"
          :height="BASE - y(m.recu)"
          rx="3"
        />
        <text
          class="ax"
          text-anchor="middle"
          :x="GAUCHE + largeurGroupe * i + largeurGroupe / 2"
          :y="BASE + 13"
        >{{ m.label }}</text>
      </g>
    </svg>
    <span
      v-if="infobulle"
      class="cz-tip graph__tip"
      :style="{ left: `${(infobulle.x / L) * 100}%`, top: `${(infobulle.y / H) * 100}%` }"
    >{{ infobulle.texte }}</span>
    <figcaption class="graph__legende">
      <span><i class="graph__carre graph__carre--exp" />{{ libelleAttendu }}</span>
      <span><i class="graph__carre graph__carre--rec" />Reçu</span>
      <slot name="legende">
        <span>Mois en cours en transparence</span>
      </slot>
    </figcaption>
  </figure>
</template>

<style scoped>
.graph {
  position: relative;
  margin: 0;
}

.ax {
  fill: var(--text-muted);
  font-family: var(--font-text);
  font-size: 9px;
}

.gl { stroke: var(--divider); }
.base { stroke: var(--border); }
.exp { fill: var(--border); }
.rec { fill: var(--brand); }
.now { fill: var(--brand); opacity: .55; }

.graph__tip {
  position: absolute;
  transform: translate(-50%, calc(-100% - var(--space-2)));
  pointer-events: none;
  width: max-content;
}

.graph__legende {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-1);
  font-size: 12px;
  color: var(--text-muted);
}

.graph__carre {
  display: inline-block;
  width: 10px;
  height: 10px;
  margin-right: var(--space-1);
  border-radius: 3px;
  vertical-align: -1px;
}

.graph__carre--exp { background: var(--border); }
.graph__carre--rec { background: var(--brand); }
</style>
