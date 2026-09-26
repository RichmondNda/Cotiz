<!--
  Import, étape 2 — Correspondance des colonnes. Desktop : pour chaque colonne du fichier, son nom, 3 valeurs
  d'exemple et le champ Cotiz (prénom, nom, téléphone, email, adresse, ignorer), pré-rempli quand les noms concordent.
  Mobile : « Associer les colonnes », chaque champ Cotiz avec la colonne du fichier associée (« Colonne A »).
-->
<script setup lang="ts">
import { CHAMPS_IMPORT, useImportSouscripteurs } from '~/composables/useImportSouscripteurs'

const { etat, erreurColonnes, lettreColonne } = useImportSouscripteurs()

const associees = computed(() => CHAMPS_IMPORT
  .filter(c => c.valeur !== 'ignorer')
  .map(c => ({ ...c, index: etat.colonnes.findIndex(col => col.champ === c.valeur) }))
  .filter(c => c.index >= 0))
</script>

<template>
  <div class="etape-colonnes">
    <div class="cz-desktop">
      <h2 class="etape-colonnes__titre">
        Correspondance des colonnes
      </h2>
      <p class="etape-colonnes__intro">
        {{ etat.analyse?.fichier }} · {{ etat.analyse?.nbLignes }} lignes. Nous avons associé automatiquement les colonnes reconnues.
      </p>
      <table class="cz-table etape-colonnes__table">
        <thead>
          <tr>
            <th>Colonne du fichier</th>
            <th>Exemples</th>
            <th>Champ Cotiz</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in etat.colonnes"
            :key="c.colonne"
          >
            <td><b>{{ c.colonne }}</b></td>
            <td
              class="etape-colonnes__exemples"
              :class="{ 'cz-mono': c.champ === 'telephone' }"
            >
              {{ c.exemples.join(' · ') }}
            </td>
            <td>
              <CzSelect
                :model-value="c.champ ?? 'ignorer'"
                :options="CHAMPS_IMPORT"
                :label="`Champ Cotiz pour la colonne ${c.colonne}`"
                :erreur="etat.tenteColonnes && Boolean(erreurColonnes)"
                class="etape-colonnes__select"
                @update:model-value="c.champ = $event === 'ignorer' || $event === null ? null : $event"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <CzCard class="etape-colonnes__mobile cz-mobile">
      <h2 class="etape-colonnes__titre">
        Associer les colonnes
      </h2>
      <ul class="etape-colonnes__liste">
        <li
          v-for="c in associees"
          :key="c.label"
        >
          <span>{{ c.label }}</span>
          <CzBadge
            ton="brand"
            petit
          >
            {{ lettreColonne(c.index) }}
          </CzBadge>
        </li>
      </ul>
    </CzCard>

    <p
      v-if="etat.tenteColonnes && erreurColonnes"
      class="cz-error"
      role="alert"
    >
      <CzIcon nom="alerte" />{{ erreurColonnes }}
    </p>
  </div>
</template>

<style scoped>
.etape-colonnes {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.etape-colonnes__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.etape-colonnes__intro {
  margin: var(--space-4) 0;
  font-size: 14px;
  color: var(--text-muted);
}

.etape-colonnes__exemples {
  color: var(--text-muted);
}

.etape-colonnes__select {
  width: 220px;
}

.etape-colonnes__mobile .etape-colonnes__titre {
  font-size: 16px;
}

.etape-colonnes__liste {
  margin: var(--space-2) 0 0;
  padding: 0;
  list-style: none;
}

.etape-colonnes__liste li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 54px;
  border-bottom: 1px solid var(--divider);
  font-size: 14px;
}
</style>
