<!--
  Derniers mouvements (accueil souscripteur) : titre de section et lien « Tout l’historique »,
  puis carte avec une liste compacte montant + date · projet + badge de statut.
-->
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
  <section class="mouvements">
    <TitreSection
      :titre="titre"
      :lien="lienTout ? { label: 'Tout l’historique', to: lienTout } : undefined"
    />
    <CzCard
      variante="lg"
      class="mouvements__carte"
    >
      <ul class="mouvements__liste">
        <li
          v-for="m in mouvements"
          :key="m.id"
        >
          <div>
            <b>{{ formatFCFA(m.montant) }}</b>
            <div class="cz-help">
              {{ formatDate(m.date, 'numerique') }} · {{ m.projet }}
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
  </section>
</template>

<style scoped>
.mouvements {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.mouvements__carte {
  padding: var(--space-2) var(--space-4);
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
  min-height: 56px;
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
