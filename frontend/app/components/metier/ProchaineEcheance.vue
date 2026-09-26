<!-- Prochaine échéance (accueil souscripteur) : montant, projet, date, compte à rebours info, « Déclarer un paiement ». -->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import { formatDate, formatFCFA, formatRelatif } from '~/utils/format'

const props = withDefaults(defineProps<{
  montant: number
  projet: string
  date: string
  to?: RouteLocationRaw
}>(), { to: '/paiements/declarer' })

const rebours = computed(() => formatRelatif(props.date))
</script>

<template>
  <section
    class="cz-next"
    aria-label="Prochaine échéance"
  >
    <div class="prochaine__haut">
      <span class="cz-help">Prochaine échéance</span>
      <span class="cz-countdown"><CzIcon nom="en-attente" />{{ rebours }}</span>
    </div>
    <div class="row">
      <div>
        <div class="amt">
          {{ formatFCFA(montant) }}
        </div>
        <div class="cz-help">
          {{ projet }} · {{ formatDate(date, 'jour-mois-long') }}
        </div>
      </div>
    </div>
    <CzButton
      bloc
      :to="to"
    >
      Déclarer un paiement
    </CzButton>
  </section>
</template>

<style scoped>
.prochaine__haut {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
}
</style>
