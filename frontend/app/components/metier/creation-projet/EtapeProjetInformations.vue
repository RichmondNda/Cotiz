<!-- Création de projet, étape 1 — Informations : nom, description (gras, listes), couverture, souscripteurs requis. -->
<script setup lang="ts">
import { useFormulaireProjet } from '~/composables/useNouveauProjet'

const { etat, erreurs } = useFormulaireProjet()
</script>

<template>
  <div class="etape">
    <h2 class="etape__titre">
      Informations
    </h2>
    <CzField
      label="Nom du projet"
      requis
      aide="Visible par les souscripteurs"
      :erreur="erreurs.nom"
    >
      <CzInput
        v-model="etat.nom"
        :maxlength="80"
      />
    </CzField>
    <CzField label="Description">
      <CzEditeurTexte
        v-model="etat.description"
        :lignes="3"
      />
    </CzField>
    <CzFileDrop
      v-model="etat.couverture"
      accept="image/jpeg,image/png"
      formats="JPG ou PNG · 5 Mo"
      icone="image"
      label="Image de couverture (optionnelle)"
    >
      Image de couverture (optionnelle) — <strong>parcourir</strong>
    </CzFileDrop>
    <CzField
      label="Nombre de souscripteurs requis"
      :erreur="erreurs.souscripteursRequis"
    >
      <div class="etape__requis">
        <CzCounter
          v-model="etat.souscripteursRequis"
          :min="1"
          :disabled="etat.sansLimite"
          label="Nombre de souscripteurs requis"
        />
        <CzCheckbox v-model="etat.sansLimite">
          Sans limite
        </CzCheckbox>
      </div>
    </CzField>
  </div>
</template>

<style scoped>
.etape__requis {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
}
</style>
