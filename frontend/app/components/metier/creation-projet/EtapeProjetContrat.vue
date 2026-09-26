<!--
  Création de projet, étape 5 — Contrat : modèle pré-rempli, variables insérables à la position du curseur,
  signataire et fonction, case « Je signe ce contrat au nom de l'association », avertissement (non modifiable ensuite).
-->
<script setup lang="ts">
import { useFormulaireProjet, VARIABLES_CONTRAT } from '~/composables/useNouveauProjet'

const { etat, erreurs, texteContrat, nomAssociation } = useFormulaireProjet()
const zone = ref<HTMLElement | null>(null)

async function inserer(variable: string) {
  const el = zone.value?.querySelector('textarea')
  const texte = texteContrat.value
  const a = el?.selectionStart ?? texte.length
  const b = el?.selectionEnd ?? texte.length
  texteContrat.value = texte.slice(0, a) + variable + texte.slice(b)
  await nextTick()
  el?.focus()
  el?.setSelectionRange(a + variable.length, a + variable.length)
}
</script>

<template>
  <div class="etape">
    <h2 class="etape__titre">
      Contrat
    </h2>
    <CzAlert
      ton="warning"
      sans-icone
      class="cz-mobile"
    >
      Une fois le projet créé, le contrat ne sera <b>plus modifiable</b>.
    </CzAlert>
    <div
      class="etape__variables"
      role="group"
      aria-label="Insérer une variable"
    >
      <span class="etape__muted">Insérer :</span>
      <CzChip
        v-for="v in VARIABLES_CONTRAT"
        :key="v"
        @click="inserer(v)"
      >
        {{ v }}
      </CzChip>
    </div>
    <div ref="zone">
      <CzField
        label="Texte du contrat"
        :erreur="erreurs.contrat"
        class="etape__texte"
      >
        <CzInput
          v-model="texteContrat"
          type="textarea"
          :lignes="7"
        />
      </CzField>
    </div>
    <div class="etape__grille">
      <CzField
        label="Signataire"
        :erreur="erreurs.signataireNom"
      >
        <CzInput v-model="etat.signataireNom" />
      </CzField>
      <CzField label="Fonction">
        <CzInput v-model="etat.signataireFonction" />
      </CzField>
    </div>
    <CzField :erreur="erreurs.signe">
      <CzCheckbox v-model="etat.signe">
        <span class="cz-desktop">Je signe ce contrat au nom de l’association</span>
        <span class="cz-mobile">Je signe ce contrat au nom d’{{ nomAssociation }} ({{ etat.signataireNom }}).</span>
      </CzCheckbox>
    </CzField>
    <CzAlert
      ton="info"
      class="cz-desktop"
    >
      Le contrat ne pourra plus être modifié après création du projet.
    </CzAlert>
  </div>
</template>

<style scoped>
.etape__variables {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
}

.etape__muted {
  color: var(--text-muted);
}

/* Le libellé « Texte du contrat » n'apparaît que dans la capture mobile. */
.etape__texte :deep(.cz-label) {
  display: none;
}

.etape__texte :deep(textarea) {
  line-height: 1.6;
}

.etape__grille {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
}

@media (max-width: 767px) {
  .etape__texte :deep(.cz-label) {
    display: block;
  }

  .etape__grille {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
