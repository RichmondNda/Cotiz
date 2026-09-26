<!-- Derniers mouvements (accueil souscripteur) : liste compacte montant + date · projet + badge de statut. -->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { StatutPaiement } from '~~/types'
import { formatDate, formatFCFA } from '~/utils/format'

withDefaults(defineProps<{
  mouvements: { id: string, montant: number, date: string, projet: string, statut: StatutPaiement }[]
  titre?: string
  lienTout?: RouteLocationRaw
}>(), { titre: 'Derniers mouvements', lienTout: '/historique' })
</script>

<template>
  <CzCard
    variante="lg"
    tag="section"
    class="mouvements"
  >
    <div class="mouvements__entete">
      <h2 class="mouvements__titre">
        {{ titre }}
      </h2>
      <NuxtLink
        v-if="lienTout"
        :to="lienTout"
        class="mouvements__tout"
      >
        Tout l'historique
      </NuxtLink>
    </div>
    <ul class="mouvements__liste">
      <li
        v-for="m in mouvements"
        :key="m.id"
      >
        <div>
          <b>{{ formatFCFA(m.montant) }}</b>
          <div class="cz-help">
            {{ formatDate(m.date, 'jour-mois') }} · {{ m.projet }}
          </div>
        </div>
        <BadgeStatut
          type="paiement"
          :statut="m.statut"
          petit
        />
      </li>
    </ul>
  </CzCard>
</template>

<style scoped>
.mouvements {
  padding: var(--space-4);
}

.mouvements__entete {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-1);
}

.mouvements__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-strong);
}

.mouvements__tout {
  font-size: 12px;
  font-weight: 600;
  color: var(--brand-dark);
  text-decoration: none;
}

.mouvements__liste {
  margin: 0;
  padding: 0;
  list-style: none;
}

.mouvements__liste li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
  font-size: 13px;
  border-bottom: 1px solid var(--divider-row);
}

.mouvements__liste li:last-child {
  border-bottom: 0;
}

.mouvements__liste b {
  color: var(--text-strong);
}
</style>
