<!--
  Création de projet, étape 3 — Calendrier : dates fixes (début, fin → nombre d'échéances calculé)
  ou cycle roulant (début seul, échéances générées jusqu'à clôture), délai de grâce avant « en retard ».
-->
<script setup lang="ts">
import type { TypeCalendrier } from '~~/types'
import { useFormulaireProjet } from '~/composables/useNouveauProjet'
import { formatSaisieDate } from '~/utils/echeancier'
import { formatMois, pluriel } from '~/utils/format'

const { etat, erreurs, debutIso, finIso, nbEcheances } = useFormulaireProjet()

const TYPES: { valeur: TypeCalendrier, label: string }[] = [
  { valeur: 'dates_fixes', label: 'Dates fixes' },
  { valeur: 'cycle_roulant', label: 'Cycle roulant' },
]

const masque = (cle: 'dateDebut' | 'dateFin') => (v: string | number | null) => (etat[cle] = formatSaisieDate(String(v ?? '')))
const mois = (iso: string | null) => (iso ? formatMois(iso).toLowerCase() : '')
const jour = computed(() => (etat.frequence === 'hebdomadaire' ? null : etat.jourEcheance))
</script>

<template>
  <div class="etape">
    <h2 class="etape__titre">
      Calendrier
    </h2>
    <CzSegmented
      v-model="etat.typeCalendrier"
      :options="TYPES"
      label="Type de calendrier"
      class="etape__segment"
    />
    <div
      v-if="etat.typeCalendrier === 'dates_fixes'"
      class="etape__grille"
    >
      <CzField
        label="Date de début"
        :erreur="erreurs.dateDebut"
      >
        <CzInput
          :model-value="etat.dateDebut"
          placeholder="JJ/MM/AAAA"
          inputmode="numeric"
          @update:model-value="masque('dateDebut')($event)"
        />
      </CzField>
      <CzField
        label="Date de fin"
        :erreur="erreurs.dateFin"
      >
        <CzInput
          :model-value="etat.dateFin"
          placeholder="JJ/MM/AAAA"
          inputmode="numeric"
          @update:model-value="masque('dateFin')($event)"
        />
      </CzField>
    </div>
    <template v-else>
      <CzField
        label="Date de début"
        :erreur="erreurs.dateDebut"
      >
        <CzInput
          :model-value="etat.dateDebut"
          placeholder="JJ/MM/AAAA"
          inputmode="numeric"
          @update:model-value="masque('dateDebut')($event)"
        />
      </CzField>
      <CzAlert ton="info">
        Les échéances se génèrent en continu jusqu’à clôture du projet.
      </CzAlert>
    </template>
    <template v-if="etat.typeCalendrier === 'dates_fixes' && nbEcheances">
      <CzAlert
        ton="info"
        icone="echeance"
        class="cz-desktop"
      >
        <b>{{ pluriel(nbEcheances, 'échéance') }}</b> de {{ mois(debutIso) }} à {{ mois(finIso) }}{{ jour ? `, le ${jour} de chaque mois` : '' }}.
      </CzAlert>
    </template>
    <CzField
      label="Délai de grâce avant « en retard »"
      :erreur="erreurs.delaiGrace"
    >
      <CzInput
        :model-value="etat.delaiGrace ?? ''"
        inputmode="numeric"
        suffixe="jours"
        class="etape__delai"
        @update:model-value="etat.delaiGrace = $event === '' ? null : Number(String($event).replace(/\D/g, ''))"
      />
    </CzField>
    <p
      v-if="etat.typeCalendrier === 'dates_fixes' && nbEcheances"
      class="etape__resume cz-mobile"
    >
      {{ pluriel(nbEcheances, 'échéance') }} · {{ mois(debutIso) }} → {{ mois(finIso) }}
    </p>
  </div>
</template>

<style scoped>
.etape__segment {
  align-self: flex-start;
}

.etape__grille {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.etape__delai {
  width: 200px;
}

.etape__resume {
  margin: 0;
  font-size: 13px;
  color: var(--text-muted);
}

@media (max-width: 767px) {
  .etape__segment {
    align-self: stretch;
  }

  .etape__segment :deep(> *) {
    flex: 1;
  }

  .etape__delai {
    width: 100%;
  }

}
</style>
