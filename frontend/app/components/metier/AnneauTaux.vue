<!-- Anneau de taux (recouvrement) : couleur de statut selon seuil — ≥ 80 % success, 50–80 % warning, < 50 % danger. -->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  taux: number
  taille?: number
  label?: string
}>(), { taille: 96, label: 'Taux de recouvrement' })

const CIRCONFERENCE = 2 * Math.PI * 46
const ton = computed(() => (props.taux >= 80 ? 'ok' : props.taux >= 50 ? 'wa' : 'ko'))
const arc = computed(() => (Math.max(0, Math.min(100, props.taux)) / 100) * CIRCONFERENCE)
</script>

<template>
  <svg
    class="ring"
    viewBox="0 0 120 120"
    :width="taille"
    role="img"
    :aria-label="`${label} : ${taux} %`"
  >
    <circle
      class="trk"
      cx="60"
      cy="60"
      r="46"
      fill="none"
      stroke-width="13"
    />
    <circle
      :class="ton"
      cx="60"
      cy="60"
      r="46"
      fill="none"
      stroke-width="13"
      :stroke-dasharray="`${arc} ${CIRCONFERENCE}`"
      stroke-linecap="round"
      transform="rotate(-90 60 60)"
    />
    <text
      class="big"
      x="60"
      y="66"
      text-anchor="middle"
    >{{ taux }}&#8239;%</text>
  </svg>
</template>

<style scoped>
.trk { stroke: var(--track); }
.ok { stroke: var(--success); }
.wa { stroke: var(--warning); }
.ko { stroke: var(--danger); }

.big {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 22px;
  fill: var(--text-strong);
}
</style>
