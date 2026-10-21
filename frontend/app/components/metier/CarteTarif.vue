<!--
  Carte de tarif (`cz-price`) : nom du plan, badge « Le plus choisi » si mis en avant (bordure brand), prix mensuel,
  limites, fonctionnalités cochées, bouton qui pré-sélectionne le plan dans le formulaire de demande.
  `apercu` (SaPlan, rendu en direct) : description courte sous le nom, bouton inerte.
-->
<script setup lang="ts">
import type { Plan, Quota } from '~~/types'
import { formatFCFA, pluriel } from '~/utils/format'

const props = withDefaults(defineProps<{
  plan: Plan
  apercu?: boolean
}>(), { apercu: false })

const quota = (q: Quota, mot: string) =>
  q === null ? `${mot}s illimités` : typeof q === 'number' ? pluriel(q, mot) : `${q} ${mot}s`
const limites = computed(() => {
  const q = props.plan.quotas
  return `${quota(q.projets, 'projet')} · ${quota(q.souscripteurs, 'souscripteur')} · ${quota(q.gestionnaires, 'gestionnaire')}`
})
</script>

<template>
  <article
    class="cz-price carte-tarif"
    :class="{ 'is-featured': plan.misEnAvant }"
  >
    <div class="nm">
      <h3 class="carte-tarif__nom">
        {{ plan.nom }}
      </h3>
      <span
        v-if="plan.misEnAvant"
        class="cz-badge cz-badge--brand"
      >Le plus choisi</span>
    </div>
    <p
      v-if="apercu && plan.description"
      class="carte-tarif__description"
    >
      {{ plan.description }}
    </p>
    <div class="pr">
      {{ formatFCFA(plan.prixMensuel) }} <small>/ mois</small>
    </div>
    <div class="carte-tarif__limites">
      {{ limites }}
    </div>
    <ul>
      <li
        v-for="f in plan.fonctionnalites"
        :key="f"
      >
        <CzIcon
          nom="coche"
          :taille="16"
        />{{ f }}
      </li>
    </ul>
    <span
      v-if="apercu"
      class="cz-btn cz-btn--block carte-tarif__bouton"
      :class="{ 'cz-btn--secondary': !plan.misEnAvant }"
      aria-hidden="true"
    >Choisir {{ plan.nom }}</span>
    <CzButton
      v-else
      :variante="plan.misEnAvant ? 'primaire' : 'secondaire'"
      bloc
      :to="{ path: '/demande', query: { plan: plan.id } }"
      class="carte-tarif__bouton"
    >
      Choisir {{ plan.nom }}
    </CzButton>
  </article>
</template>

<style scoped>
.carte-tarif {
  gap: var(--space-3);
}

.carte-tarif__nom {
  margin: 0;
  font: inherit;
  font-size: 17px;
}

.carte-tarif__description {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

.carte-tarif__limites {
  font-size: 13px;
  color: var(--text-muted);
}

.carte-tarif ul {
  margin: 0;
  gap: var(--space-3);
  font-size: 14px;
}

.carte-tarif__bouton {
  margin-top: auto;
}
</style>
