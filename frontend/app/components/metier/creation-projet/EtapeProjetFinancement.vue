<!-- Création de projet, étape 2 — Financement : fonds d'entrée (interrupteur + montant), montant par échéance, fréquence, jour. -->
<script setup lang="ts">
import type { Frequence } from '~~/types'
import { useFormulaireProjet } from '~/composables/useNouveauProjet'
import { LIBELLES_FREQUENCE } from '~/utils/echeancier'
import { formatFCFA } from '~/utils/format'

const { etat, erreurs, fondsEntree, nbEcheances, total } = useFormulaireProjet()

const FREQUENCES = (Object.keys(LIBELLES_FREQUENCE) as Frequence[]).map(f => ({ valeur: f, label: LIBELLES_FREQUENCE[f] }))
const JOURS = [1, 5, 10, 15].map(j => ({ valeur: j, label: `Le ${j} du mois` }))
</script>

<template>
  <div class="etape">
    <h2 class="etape__titre">
      Financement
    </h2>
    <label class="etape__interrupteur">
      <CzToggle
        v-model="etat.fondsEntreeActif"
        label="Fonds d’entrée"
      />
      <b>Fonds d’entrée</b>
    </label>
    <CzField
      v-if="etat.fondsEntreeActif"
      label="Montant du fonds d’entrée"
      :erreur="erreurs.fondsEntree"
    >
      <CzInput
        v-model="etat.fondsEntree"
        type="montant"
      />
    </CzField>
    <CzField
      label="Montant par échéance"
      requis
      :erreur="erreurs.montantEcheance"
    >
      <CzInput
        v-model="etat.montantEcheance"
        type="montant"
      />
    </CzField>
    <div class="etape__grille">
      <CzField label="Fréquence">
        <CzSelect
          v-model="etat.frequence"
          :options="FREQUENCES"
        />
      </CzField>
      <CzField
        v-if="etat.frequence !== 'hebdomadaire'"
        label="Jour d’échéance"
      >
        <CzSelect
          v-model="etat.jourEcheance"
          :options="JOURS"
        />
      </CzField>
    </div>
    <p
      v-if="total !== null && etat.montantEcheance"
      class="etape__total cz-mobile"
    >
      Total par souscripteur : <b>{{ formatFCFA(total) }}</b>
      ({{ fondsEntree ? `${formatFCFA(fondsEntree)} + ` : '' }}{{ nbEcheances }} × {{ formatFCFA(etat.montantEcheance) }})
    </p>
  </div>
</template>

<style scoped>
.etape__interrupteur {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  font-size: 14px;
  cursor: pointer;
}

.etape__grille {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

.etape__total {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-md);
  background: var(--brand-pale);
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--ink-title);
}

@media (max-width: 767px) {
  .etape__interrupteur {
    flex-direction: row-reverse;
    justify-content: space-between;
  }

  .etape__interrupteur b {
    font-weight: 400;
    font-size: 14.5px;
  }

  .etape__grille {
    grid-template-columns: minmax(0, 1fr);
  }

}
</style>
