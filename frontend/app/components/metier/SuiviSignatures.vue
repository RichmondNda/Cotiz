<!--
  Suivi des signatures du contrat d'un projet (MgProjetContrat) : barre de progression (verte), non-signataires avec
  « Relancer » (« Relancé ✓ » une fois envoyé), lien « Voir tous ». Tous signés : bandeau de succès.
  Desktop : « Suivi des signatures », « 51 / 52 signés · 98 % ». Mobile (`compact`) : « Signatures · 51 / 52 ».
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { ContratProjet } from '~~/types'
import { formatDate, formatPourcent } from '~/utils/format'

type NonSignataire = ContratProjet['nonSignataires'][number]

const props = withDefaults(defineProps<{
  signes: number | '[N]'
  total: number | '[N]'
  nonSignataires: NonSignataire[]
  compact?: boolean
  voirTous?: RouteLocationRaw
  relances?: string[]
  envoi?: string | null
}>(), { compact: false, voirTous: undefined, relances: () => [], envoi: null })

defineEmits<{ relancer: [n: NonSignataire] }>()

/** null tant que les effectifs sont des placeholders : pas de barre ni de pourcentage. */
const taux = computed(() => (typeof props.signes === 'number' && typeof props.total === 'number' && props.total
  ? Math.floor((props.signes / props.total) * 100)
  : null))
</script>

<template>
  <CzCard
    tag="section"
    class="suivi"
    :class="{ 'is-compact': compact }"
    :aria-label="compact ? 'Signatures' : 'Suivi des signatures'"
  >
    <div
      v-if="compact"
      class="suivi__entete"
    >
      <h2 class="suivi__titre">
        Signatures
      </h2>
      <b class="suivi__ratio">{{ signes }} / {{ total }}</b>
    </div>
    <template v-else>
      <h2 class="suivi__titre">
        Suivi des signatures
      </h2>
      <div class="suivi__compte">
        <span>{{ signes }} / {{ total }} signés</span>
        <b v-if="taux !== null">{{ formatPourcent(taux) }}</b>
      </div>
    </template>
    <CzProgress
      v-if="taux !== null"
      :valeur="taux"
      ton="success"
      :label="`${signes} contrats signés sur ${total}`"
    />

    <CzAlert
      v-if="!nonSignataires.length"
      ton="success"
      sans-icone
      class="suivi__complet"
    >
      <b v-if="!compact">Tous les souscripteurs ont signé.</b><template v-else>
        Tous les souscripteurs ont signé.
      </template>
    </CzAlert>
    <template v-else>
      <div
        v-if="!compact"
        class="suivi__legende"
      >
        Non-signataires
      </div>
      <ul class="suivi__liste">
        <li
          v-for="n in nonSignataires"
          :key="n.souscripteurId"
          class="suivi__ligne"
        >
          <CzAvatar
            :nom="n.nom"
            taille="sm"
            ton="warning"
          />
          <div class="suivi__personne">
            <NuxtLink
              :to="`/asso/souscripteurs/${n.souscripteurId}`"
              class="suivi__nom"
            >
              {{ n.nom }}
            </NuxtLink>
            <span class="suivi__detail">{{ compact ? 'pas encore signé' : `Ajouté·e le ${formatDate(n.inscritLe, 'numerique')}` }}</span>
          </div>
          <CzButton
            variante="secondaire"
            taille="sm"
            :chargement="envoi === n.souscripteurId"
            :disabled="relances.includes(n.souscripteurId)"
            :aria-label="relances.includes(n.souscripteurId) ? `${n.nom} relancé` : `Relancer ${n.nom}`"
            @click="$emit('relancer', n)"
          >
            {{ relances.includes(n.souscripteurId) ? 'Relancé ✓' : 'Relancer' }}
          </CzButton>
        </li>
      </ul>
      <NuxtLink
        v-if="voirTous && !compact"
        :to="voirTous"
        class="suivi__tous"
      >
        Voir tous →
      </NuxtLink>
    </template>
  </CzCard>
</template>

<style scoped>
.suivi {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.suivi__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.suivi__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
}

.suivi__ratio {
  font-family: var(--font-display);
  color: var(--text-strong);
}

.suivi__compte {
  display: flex;
  justify-content: space-between;
  margin-bottom: calc(-1 * var(--space-1));
  font-size: 13.5px;
}

.suivi__compte b {
  color: var(--text-strong);
}

.suivi__legende {
  margin-top: var(--space-2);
  font-size: 12.5px;
  color: var(--text-muted);
}

.suivi__liste {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.suivi__ligne {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.is-compact .suivi__ligne {
  padding-top: var(--space-2);
  border-top: 1px solid var(--divider);
}

.suivi__personne {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.suivi__nom {
  font-weight: 600;
  color: var(--text-strong);
  text-decoration: none;
}

.suivi__nom:hover,
.suivi__tous:hover {
  text-decoration: underline;
}

.suivi__detail {
  font-size: 12px;
  color: var(--text-muted);
}

.suivi__tous {
  align-self: flex-start;
  font-size: 13px;
  font-weight: 600;
  color: var(--brand-dark);
  text-decoration: none;
}

.suivi__complet {
  margin-top: var(--space-2);
}
</style>
