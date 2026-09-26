<!--
  Création de projet, étape 4 — Modalités de paiement : moyens repris de l'association (modifiables pour ce projet),
  coordonnées de chaque moyen retenu, instructions spécifiques.
  Desktop : cases à cocher + instructions ; les coordonnées s'affichent en mobile (comme dans les captures).
-->
<script setup lang="ts">
import { MOYENS_ORDRE, useFormulaireProjet } from '~/composables/useNouveauProjet'
import { MOYENS_PAIEMENT } from '~/utils/statuts'

const { etat, erreurs } = useFormulaireProjet()
</script>

<template>
  <div class="etape">
    <h2 class="etape__titre">
      Modalités de paiement
    </h2>
    <p class="etape__intro cz-desktop">
      Reprises des moyens par défaut de l’association, modifiables pour ce projet.
    </p>
    <CzField :erreur="erreurs.moyens">
      <div
        class="etape__moyens"
        role="group"
        aria-label="Moyens de paiement"
      >
        <CzCheckbox
          v-for="m in MOYENS_ORDRE"
          :key="m"
          v-model="etat.moyens[m]"
        >
          {{ MOYENS_PAIEMENT[m] }}
        </CzCheckbox>
      </div>
    </CzField>
    <div class="etape__coordonnees cz-mobile">
      <CzField
        v-if="etat.moyens.mobile_money"
        label="Mobile money"
      >
        <CzInput v-model="etat.coordonnees.mobileMoney" />
      </CzField>
      <CzField
        v-if="etat.moyens.virement"
        label="Virement (IBAN)"
      >
        <CzInput
          v-model="etat.coordonnees.iban"
          mono
        />
      </CzField>
      <CzField
        v-if="etat.moyens.especes"
        label="Espèces (instructions)"
      >
        <CzInput v-model="etat.coordonnees.especes" />
      </CzField>
      <p class="etape__intro">
        Repris des paramètres de l’association. Modifiable pour ce projet.
      </p>
    </div>
    <CzField label="Instructions spécifiques">
      <CzInput
        v-model="etat.instructions"
        type="textarea"
        :lignes="2"
        placeholder="Ex. : indiquez votre nom en référence du virement."
      />
    </CzField>
  </div>
</template>

<style scoped>
.etape__intro {
  margin: 0;
  font-size: 14px;
  color: var(--text-muted);
}

.etape__moyens {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.etape__coordonnees {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

@media (max-width: 767px) {
  .etape__intro {
    font-size: 13px;
  }
}
</style>
