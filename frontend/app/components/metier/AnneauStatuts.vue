<!--
  Anneau segmenté « Souscripteurs par statut » (MgProjetRapports) : total au centre, un segment par statut réel
  (à jour · en retard · signature), légende avec libellé et effectif (la couleur ne porte jamais seule l'information).
-->
<script setup lang="ts">
export interface SegmentStatut {
  libelle: string
  valeur: number
  ton: 'success' | 'danger' | 'warning'
}

const props = withDefaults(defineProps<{
  segments: SegmentStatut[]
  taille?: number
  label?: string
}>(), { taille: 96, label: 'Souscripteurs par statut' })

/** Pastille de légende : cases de la grille d'échéances (cz-cell). */
const CELLULES = { success: 'ok', danger: 'late', warning: 'wait' } as const

const R = 46
const CIRCONFERENCE = 2 * Math.PI * R
const total = computed(() => props.segments.reduce((t, s) => t + s.valeur, 0))
const arcs = computed(() => {
  let debut = 0
  return props.segments.filter(s => s.valeur > 0).map((s) => {
    const longueur = total.value ? (s.valeur / total.value) * CIRCONFERENCE : 0
    const arc = { ...s, longueur, decalage: -debut }
    debut += longueur
    return arc
  })
})
</script>

<template>
  <figure class="anneau">
    <svg
      viewBox="0 0 120 120"
      :width="taille"
      :height="taille"
      role="img"
      :aria-label="`${label} : ${segments.map(s => `${s.libelle} ${s.valeur}`).join(', ')}`"
    >
      <circle
        class="anneau__piste"
        cx="60"
        cy="60"
        :r="R"
        fill="none"
        stroke-width="13"
      />
      <circle
        v-for="a in arcs"
        :key="a.libelle"
        :class="`anneau__seg--${a.ton}`"
        cx="60"
        cy="60"
        :r="R"
        fill="none"
        stroke-width="13"
        :stroke-dasharray="`${a.longueur} ${CIRCONFERENCE}`"
        :stroke-dashoffset="a.decalage"
        transform="rotate(-90 60 60)"
      />
      <text
        class="anneau__total"
        x="60"
        y="67"
        text-anchor="middle"
      >{{ total }}</text>
    </svg>
    <figcaption class="anneau__legende">
      <span
        v-for="s in segments"
        :key="s.libelle"
      ><i :class="`cz-cell cz-cell--sm cz-cell--${CELLULES[s.ton]}`" />{{ s.libelle }} · {{ s.valeur }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.anneau {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin: 0;
}

.anneau svg {
  flex-shrink: 0;
}

.anneau__piste { stroke: var(--track); }
.anneau__seg--success { stroke: var(--success); }
.anneau__seg--danger { stroke: var(--danger); }
.anneau__seg--warning { stroke: var(--warning); }

.anneau__total {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 600;
  fill: var(--text-strong);
}

.anneau__legende {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: 12.5px;
  color: var(--text);
}

.anneau__legende span {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
}
</style>
