<!--
  Visuel produit de la landing : fenêtre du tableau de bord gestionnaire, inclinée (3 indicateurs + extrait de la
  grille d'échéances). Illustration statique : chiffres de DONNEES-REFERENCE (tableau de bord d'Entraide Yopougon).
-->
<script setup lang="ts">
import type { StatutEcheance } from '~~/types'
import { formatFCFA } from '~/utils/format'

const KPIS = [
  { libelle: 'Collecté ce mois', valeur: formatFCFA(1_240_000) },
  { libelle: 'À valider', valeur: '6' },
  { libelle: 'En retard', valeur: '14' },
]

const LIGNES: { nom: string, cellules: StatutEcheance[] }[] = [
  { nom: 'Moussa Diarra', cellules: ['payee', 'payee', 'payee', 'en_retard', 'en_retard', 'a_venir'] },
  { nom: 'Jean Kouassi', cellules: ['payee', 'payee', 'payee', 'partielle', 'payee', 'a_venir'] },
  { nom: 'Awa Koné', cellules: ['payee', 'payee', 'payee', 'payee', 'declaree', 'a_venir'] },
]

const CLASSES: Partial<Record<StatutEcheance, string>> = {
  payee: 'cz-cell--ok',
  declaree: 'cz-cell--wait',
  partielle: 'cz-cell--part',
  en_retard: 'cz-cell--late',
  a_venir: 'cz-cell--fut',
}
</script>

<template>
  <div
    class="apercu-tdb"
    aria-hidden="true"
  >
    <div class="apercu-tdb__barre">
      <span /><span /><span />
    </div>
    <div class="apercu-tdb__corps">
      <div
        v-for="k in KPIS"
        :key="k.libelle"
        class="cz-kpi apercu-tdb__kpi"
      >
        <div class="l">
          {{ k.libelle }}
        </div>
        <div class="v">
          {{ k.valeur }}
        </div>
      </div>
      <div class="apercu-tdb__grille">
        <div
          v-for="l in LIGNES"
          :key="l.nom"
          class="apercu-tdb__ligne"
        >
          <b>{{ l.nom }}</b>
          <span
            v-for="(c, i) in l.cellules"
            :key="i"
            class="cz-cell"
            :class="CLASSES[c]"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.apercu-tdb {
  width: 520px;
  overflow: hidden;
  border-radius: var(--r-card);
  background: var(--violet-page);
  box-shadow: var(--shadow-modal);
  transform: rotate(-2deg);
}

.apercu-tdb__barre {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 var(--space-3);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.apercu-tdb__barre span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--border);
}

.apercu-tdb__corps {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  padding: var(--space-4);
}

.apercu-tdb__kpi {
  padding: var(--space-3);
}

.apercu-tdb__kpi .l {
  font-size: 11px;
}

.apercu-tdb__kpi .v {
  font-size: 18px;
}

.apercu-tdb__grille {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  grid-column: span 3;
  padding: var(--space-3) 14px;
  border-radius: var(--r-md);
  background: var(--surface);
  font-size: 12px;
}

.apercu-tdb__ligne {
  display: flex;
  align-items: center;
  gap: 6px;
}

.apercu-tdb__ligne b {
  width: 110px;
  color: var(--text-strong);
}
</style>
