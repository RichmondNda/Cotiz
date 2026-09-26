<!--
  Création de projet, étape 6 — Récapitulatif : informations groupées par étape avec « Modifier »,
  12 premières échéances (fonds d'entrée compris), total attendu par souscripteur.
  Mobile : résumé en lignes libellé / valeur (comme la capture).
-->
<script setup lang="ts">
import { useFormulaireProjet } from '~/composables/useNouveauProjet'
import { formatDate, formatFCFA } from '~/utils/format'
import { MOYENS_PAIEMENT } from '~/utils/statuts'

const { etat, aller, fondsEntree, nbEcheances, total, echeancier, unite, moyensChoisis, resumeCalendrier, periodeCourte } = useFormulaireProjet()

const requis = computed(() => (etat.sansLimite ? 'sans limite de souscripteurs' : `${etat.souscripteursRequis} souscripteurs requis`))
const financement = computed(() => {
  const echeance = `${formatFCFA(etat.montantEcheance ?? 0)} / ${unite.value}${etat.frequence !== 'hebdomadaire' ? `, le ${etat.jourEcheance}` : ''}`
  return fondsEntree.value ? `Entrée ${formatFCFA(fondsEntree.value)} · ${echeance}` : echeance
})
const paiement = computed(() => moyensChoisis.value
  .map((m, i) => (i === 0 ? MOYENS_PAIEMENT[m] : MOYENS_PAIEMENT[m].toLowerCase()))
  .join(', '))
const contrat = computed(() => (etat.signe
  ? `Signé par ${[etat.signataireNom, etat.signataireFonction.toLowerCase()].filter(Boolean).join(', ')}`
  : 'Non signé'))
const engagement = computed(() => {
  const echeances = nbEcheances.value ? `${nbEcheances.value} × ${formatFCFA(etat.montantEcheance ?? 0)}` : `${formatFCFA(etat.montantEcheance ?? 0)} / ${unite.value}`
  return fondsEntree.value ? `${formatFCFA(fondsEntree.value)} + ${echeances}` : echeances
})

const BLOCS = computed(() => [
  { etape: 1, libelle: 'Informations', valeur: `${etat.nom} · ${requis.value}` },
  { etape: 2, libelle: 'Financement', valeur: financement.value },
  { etape: 3, libelle: 'Calendrier', valeur: resumeCalendrier.value },
  { etape: 4, libelle: 'Paiement', valeur: paiement.value },
  { etape: 5, libelle: 'Contrat', valeur: contrat.value },
])
</script>

<template>
  <div class="etape">
    <h2 class="etape__titre">
      Récapitulatif
    </h2>

    <!-- Desktop -->
    <div class="recap cz-desktop">
      <div
        v-for="b in BLOCS"
        :key="b.etape"
        class="recap__bloc"
      >
        <span class="recap__libelle">{{ b.libelle }}</span>
        <b>{{ b.valeur }}</b>
        <CzButton
          variante="fantome"
          taille="sm"
          :aria-label="`Modifier : ${b.libelle}`"
          @click="aller(b.etape)"
        >
          Modifier
        </CzButton>
      </div>
      <h3 class="recap__sous-titre">
        {{ echeancier.length }} premières échéances
      </h3>
      <div class="cz-table-wrap recap__table">
        <table class="cz-table">
          <thead>
            <tr>
              <th>Échéance</th>
              <th>Date</th>
              <th class="num">
                Montant
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="e in echeancier"
              :key="e.libelle"
            >
              <td>{{ e.libelle }}</td>
              <td class="recap__muted">
                {{ formatDate(e.date, e.estFondsEntree ? 'numerique' : 'court') }}
              </td>
              <td class="num">
                {{ formatFCFA(e.montant) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div
        v-if="total !== null"
        class="recap__total"
      >
        <span>Total attendu par souscripteur</span>
        <b>{{ formatFCFA(total) }}</b>
      </div>
    </div>

    <!-- Mobile -->
    <dl class="recap-m cz-mobile">
      <div><dt>Projet</dt><dd>{{ etat.nom }}</dd></div>
      <div><dt>Souscripteurs requis</dt><dd>{{ etat.sansLimite ? 'Sans limite' : etat.souscripteursRequis }}</dd></div>
      <div><dt>Engagement</dt><dd>{{ engagement }}</dd></div>
      <div><dt>Calendrier</dt><dd>{{ periodeCourte }}</dd></div>
      <div><dt>Contrat</dt><dd>{{ etat.signe ? 'Signé par l’association' : 'Non signé' }}</dd></div>
    </dl>
  </div>
</template>

<style scoped>
.recap {
  display: flex;
  flex-direction: column;
}

.recap__bloc {
  display: grid;
  grid-template-columns: 170px minmax(0, 1fr) auto;
  gap: var(--space-2) var(--space-3);
  align-items: baseline;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--divider);
  font-size: 14px;
}

.recap__libelle,
.recap__muted {
  color: var(--text-muted);
}

.recap__sous-titre {
  margin: var(--space-4) 0 var(--space-2);
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: var(--text-strong);
}

.recap__table {
  box-shadow: none;
}

/* Échéancier compact (lignes de 38 px, comme la maquette). */
.recap__table td {
  height: 38px;
  padding-top: 0;
  padding-bottom: 0;
}

.recap__total {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-top: var(--space-3);
  font-size: 15px;
}

.recap__total b {
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--text-strong);
}

.recap-m {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  margin: 0;
}

.recap-m > div {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-1) 0;
  font-size: 14px;
}

.recap-m dt {
  color: var(--text-muted);
}

.recap-m dd {
  margin: 0;
  font-weight: 700;
  text-align: right;
  color: var(--text-strong);
}
</style>
