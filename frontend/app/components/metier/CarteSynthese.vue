<!--
  Synthèse de l'accueil souscripteur : fond corail plein, « Total restant à payer » en montant héros.
  Ligne danger-bg intégrée si retard (lien « Régulariser »), success-bg si tout est payé.
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { formatFCFA } from '~/utils/format'

withDefaults(defineProps<{
  total: number
  /** « sur 3 projets · 2 associations » ou « Tout est payé ». */
  detail?: string
  retard?: number
  lienRetard?: RouteLocationRaw
  toutPaye?: boolean
  libelle?: string
}>(), {
  detail: undefined,
  retard: 0,
  lienRetard: undefined,
  toutPaye: false,
  libelle: 'Total restant à payer',
})
</script>

<template>
  <section
    class="cz-summary"
    :aria-label="libelle"
  >
    <div class="l">
      {{ libelle }}
    </div>
    <div class="v">
      {{ formatFCFA(total) }}
    </div>
    <div
      v-if="detail"
      class="s"
    >
      {{ detail }}
    </div>
    <div
      v-if="retard > 0"
      class="late"
    >
      <span>{{ formatFCFA(retard) }} en retard</span>
      <NuxtLink
        v-if="lienRetard"
        :to="lienRetard"
        class="synthese__lien"
      >Régulariser</NuxtLink>
    </div>
    <div
      v-else-if="toutPaye"
      class="ok"
    >
      <CzIcon
        nom="valide"
        :taille="18"
      />Félicitations, vous êtes à jour !
    </div>
  </section>
</template>

<style scoped>
.synthese__lien {
  color: inherit;
  text-decoration: underline;
}
</style>
