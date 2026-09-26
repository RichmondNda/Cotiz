<!--
  Rangée de cases d'échéances d'un souscripteur sur un projet (grille sur une ligne) : détail d'un paiement,
  fiche souscripteur. 1re case = fonds d'entrée ; couleurs de la grille (payée, déclarée, en retard, partielle,
  à venir) ; le résumé des statuts est lu par les lecteurs d'écran.
-->
<script setup lang="ts">
import type { Echeance, StatutEcheance } from '~~/types'
import { libelleEcheance } from '~/utils/echeances'
import { STATUTS_ECHEANCE } from '~/utils/statuts'

const props = withDefaults(defineProps<{
  echeances: Echeance[]
  /** Nombre de cases affichées (la maquette montre 13 cases : entrée + 12 mois). */
  max?: number
}>(), { max: 13 })

const CLASSES: Record<StatutEcheance, string> = {
  payee: 'ok',
  declaree: 'wait',
  en_retard: 'late',
  partielle: 'part',
  a_venir: 'fut',
}

const cases = computed(() => [...props.echeances].sort((a, b) => a.rang - b.rang).slice(0, props.max))
const resume = computed(() => {
  const n = new Map<StatutEcheance, number>()
  for (const e of cases.value) n.set(e.statut, (n.get(e.statut) ?? 0) + 1)
  return [...n].map(([s, k]) => `${k} ${STATUTS_ECHEANCE[s].libelle.toLowerCase()}`).join(', ')
})
</script>

<template>
  <div
    class="rangee"
    role="img"
    :aria-label="`Échéances : ${resume}`"
  >
    <span
      v-for="e in cases"
      :key="e.id"
      class="cz-cell rangee__case"
      :class="`cz-cell--${CLASSES[e.statut]}`"
      :title="`${libelleEcheance(e)} · ${STATUTS_ECHEANCE[e.statut].libelle}`"
    />
  </div>
</template>

<style scoped>
.rangee {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.rangee__case {
  cursor: default;
}

.rangee__case:hover {
  transform: none;
}

@media (max-width: 767px) {
  /* 13 cases sur une ligne à 390 px. */
  .rangee__case {
    width: 18px;
    height: 18px;
  }
}
</style>
