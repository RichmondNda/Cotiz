<!--
  « Mes versements par mois » (historique souscripteur) : barres empilées par projet (une couleur par projet,
  légende avec le nom court), courbe du cumul versé par-dessus, mois en abscisse.
  Les barres et la courbe ont chacune leur échelle. Montant de chaque barre dans l'infobulle (title) et le libellé.
-->
<script setup lang="ts">
import { formatFCFA } from '~/utils/format'

export interface SerieVersements {
  cle: string
  label: string
  /** Variable de couleur du design system (`var(--corail)`). */
  couleur: string
}

export interface MoisVersements {
  label: string
  /** Montant validé par série (clé de la série → montant). */
  montants: Record<string, number>
}

const props = defineProps<{
  series: SerieVersements[]
  mois: MoisVersements[]
  titre?: string
}>()

const totaux = computed(() => props.mois.map(m => props.series.reduce((t, s) => t + (m.montants[s.cle] ?? 0), 0)))
const cumuls = computed(() => totaux.value.reduce<number[]>((acc, t) => [...acc, (acc.at(-1) ?? 0) + t], []))
const echelleBarres = computed(() => Math.max(...totaux.value, 1) / 0.75)
const echelleCourbe = computed(() => Math.max(...cumuls.value, 1) / 0.85)

const points = computed(() => cumuls.value.map((c, i) => {
  const x = ((i + 0.5) / Math.max(1, props.mois.length)) * 100
  const y = 100 - (c / echelleCourbe.value) * 100
  return `${x.toFixed(2)},${y.toFixed(2)}`
}).join(' '))

const description = computed(() => props.mois
  .map((m, i) => `${m.label} : ${formatFCFA(totaux.value[i] ?? 0)}`)
  .join(', '))
</script>

<template>
  <figure
    class="graph"
    :aria-label="`${titre ?? 'Versements par mois'} — ${description}`"
  >
    <div class="graph__entete">
      <figcaption
        v-if="titre"
        class="graph__titre"
      >
        {{ titre }}
      </figcaption>
      <ul
        class="graph__legende"
        aria-hidden="true"
      >
        <li
          v-for="s in series"
          :key="s.cle"
        >
          <span
            class="graph__carre"
            :style="{ background: s.couleur }"
          />{{ s.label }}
        </li>
        <li>
          <span class="graph__trait" />Cumul
        </li>
      </ul>
    </div>
    <div
      class="graph__zone"
      aria-hidden="true"
    >
      <div class="graph__barres">
        <div
          v-for="(m, i) in mois"
          :key="m.label"
          class="graph__colonne"
          :title="`${m.label} : ${formatFCFA(totaux[i] ?? 0)}`"
        >
          <div
            class="graph__pile"
            :style="{ height: `${((totaux[i] ?? 0) / echelleBarres) * 100}%` }"
          >
            <span
              v-for="s in series"
              v-show="m.montants[s.cle]"
              :key="s.cle"
              :style="{ flexGrow: m.montants[s.cle] ?? 0, background: s.couleur }"
            />
          </div>
        </div>
      </div>
      <svg
        class="graph__courbe"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <polyline
          :points="points"
          fill="none"
          vector-effect="non-scaling-stroke"
        />
      </svg>
    </div>
    <div
      class="graph__mois"
      aria-hidden="true"
    >
      <span
        v-for="m in mois"
        :key="m.label"
      >{{ m.label }}</span>
    </div>
    <slot />
  </figure>
</template>

<style scoped>
.graph {
  margin: 0;
}

.graph__entete {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2) var(--space-4);
}

.graph__titre {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.graph__legende {
  display: flex;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 12.5px;
  color: var(--text-muted);
}

.graph__legende li {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}

.graph__carre {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.graph__trait {
  width: 14px;
  height: 2px;
  background: var(--ink-title);
}

.graph__zone {
  position: relative;
  height: 160px;
  margin-top: var(--space-6);
}

.graph__barres {
  display: flex;
  align-items: flex-end;
  height: 100%;
}

.graph__colonne {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  height: 100%;
}

.graph__pile {
  display: flex;
  flex-direction: column-reverse;
  width: min(44px, 60%);
  min-height: 2px;
  overflow: hidden;
  border-radius: var(--r-xs) var(--r-xs) 0 0;
}

.graph__pile span {
  flex-basis: 0;
}

.graph__courbe {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.graph__courbe polyline {
  stroke: var(--ink-title);
  stroke-width: 2;
  stroke-linejoin: round;
}

.graph__mois {
  display: flex;
  margin-top: var(--space-3);
  font-size: 11.5px;
  color: var(--text-muted);
}

.graph__mois span {
  flex: 1;
  text-align: center;
}

@media (max-width: 767px) {
  .graph__entete {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
