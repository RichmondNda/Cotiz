<!--
  Échéancier d'un souscripteur sur un projet : mois, montant, badge de statut.
  - Échéance du mois en cours mise en évidence (fond brand-pale, « · ce mois-ci ») ; retards sur fond danger-bg.
  - Échéances passées repliées : on montre les deux qui précèdent le mois en cours,
    « Voir les N échéances précédentes » déplie le reste. Au plus 10 lignes, puis « Voir les N échéances suivantes ».
  - Paiement partiel : « 10 000 / 25 000 F ».
  `complet` affiche tout sans repli (projet terminé).
-->
<script setup lang="ts">
import type { Echeance } from '~~/types'
import { maintenant } from '~/utils/date-reference'
import { libelleEcheance } from '~/utils/echeances'
import { formatFCFA, lireDate, pluriel } from '~/utils/format'

const props = withDefaults(defineProps<{
  echeances: Echeance[]
  complet?: boolean
}>(), { complet: false })

const LIGNES_MAX = 10
const precedentesVisibles = ref(false)
const suivantesVisibles = ref(false)

const tri = computed(() => [...props.echeances].sort((a, b) => a.rang - b.rang))

/** Index de l'échéance du mois en cours (hors fonds d'entrée). */
const indexCourant = computed(() => {
  const ref = maintenant()
  return tri.value.findIndex((e) => {
    if (e.estFondsEntree || !/^\d{4}-/.test(e.date)) return false
    const d = lireDate(e.date)
    return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
  })
})

const debut = computed(() => (props.complet || precedentesVisibles.value || indexCourant.value < 0 ? 0 : Math.max(0, indexCourant.value - 2)))
const fin = computed(() => (props.complet || suivantesVisibles.value ? tri.value.length : Math.min(tri.value.length, debut.value + LIGNES_MAX)))
const lignes = computed(() => tri.value.slice(debut.value, fin.value))
const nbSuivantes = computed(() => tri.value.length - fin.value)

const estCourante = (e: Echeance) => !props.complet && tri.value[indexCourant.value]?.id === e.id
</script>

<template>
  <div class="echeancier">
    <button
      v-if="debut > 0"
      type="button"
      class="echeancier__plus"
      @click="precedentesVisibles = true"
    >
      Voir {{ debut > 1 ? `les ${pluriel(debut, 'échéance')} précédentes` : 'l’échéance précédente' }}
    </button>
    <ul class="echeancier__liste">
      <li
        v-for="e in lignes"
        :key="e.id"
        class="echeancier__ligne"
        :class="{ 'is-courante': estCourante(e), 'is-retard': e.statut === 'en_retard' }"
        :aria-current="estCourante(e) ? 'date' : undefined"
      >
        <span class="echeancier__mois">
          {{ libelleEcheance(e) }}<small v-if="estCourante(e)"> · ce mois-ci</small>
        </span>
        <span class="echeancier__montant">
          <template v-if="e.statut === 'partielle'">{{ formatFCFA(e.montantPaye, { unite: false }) }} / </template>{{ formatFCFA(e.montant) }}
        </span>
        <BadgeStatut
          type="echeance"
          :statut="e.statut"
          petit
          class="echeancier__badge"
        />
      </li>
    </ul>
    <button
      v-if="nbSuivantes > 0"
      type="button"
      class="echeancier__plus"
      @click="suivantesVisibles = true"
    >
      Voir {{ nbSuivantes > 1 ? `les ${pluriel(nbSuivantes, 'échéance')} suivantes` : 'l’échéance suivante' }}
    </button>
  </div>
</template>

<style scoped>
.echeancier {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.echeancier__plus {
  min-height: 44px;
  border: 0;
  border-radius: var(--r-field);
  background: var(--surface-subtle);
  font-family: var(--font-text);
  font-size: 13.5px;
  font-weight: 600;
  color: var(--brand-dark);
  cursor: pointer;
}

.echeancier__plus:hover {
  background: var(--surface-hover);
}

.echeancier__plus:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.echeancier__liste {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.echeancier__ligne {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 48px;
  padding: 0 var(--space-3);
  border-radius: var(--r-field);
  font-size: 14px;
}

.echeancier__ligne.is-retard {
  background: var(--danger-bg);
}

.echeancier__ligne.is-courante {
  background: var(--brand-pale);
}

.echeancier__mois {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  color: var(--text-strong);
}

.echeancier__mois small {
  font-size: 11.5px;
  color: var(--brand-dark);
}

.echeancier__montant {
  font-weight: 600;
  color: var(--text-strong);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  text-align: right;
}

.echeancier__badge {
  flex-shrink: 0;
}

@media (max-width: 767px) {
  .echeancier__ligne {
    gap: var(--space-2);
    padding: 0 var(--space-2);
    font-size: 13.5px;
  }

  .echeancier__mois small {
    white-space: nowrap;
  }
}
</style>
