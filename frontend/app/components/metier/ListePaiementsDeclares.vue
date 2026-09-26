<!--
  Paiements déclarés par le souscripteur sur un projet : montant, date · échéances couvertes, statut.
  Paiement rejeté : bandeau danger avec le motif et « Déclarer à nouveau » (projet pré-sélectionné).
-->
<script setup lang="ts">
import type { Echeance, Paiement } from '~~/types'
import { libelleCouverture } from '~/utils/echeances'
import { formatDate, formatFCFA } from '~/utils/format'
import { lienDeclarer } from '~/utils/souscriptions'
import { MOTIFS_REJET } from '~/utils/statuts'

const props = defineProps<{
  paiements: Paiement[]
  /** Échéances du projet, pour nommer celles que couvre chaque paiement. */
  echeances: Echeance[]
}>()

function couverture(p: Paiement) {
  const ids = new Set(p.repartition.map(r => r.echeanceId))
  return libelleCouverture(props.echeances.filter(e => ids.has(e.id)))
}

function motif(p: Paiement) {
  if (p.motifRejet === 'autre' && p.messageRejet) return p.messageRejet
  return p.motifRejet ? MOTIFS_REJET[p.motifRejet] : undefined
}
</script>

<template>
  <ul class="paiements-declares">
    <li
      v-for="p in paiements"
      :key="p.id"
    >
      <div class="paiements-declares__ligne">
        <div>
          <b>{{ formatFCFA(p.montant) }}</b>
          <div class="cz-help">
            {{ formatDate(p.declareLe, 'numerique') }}<template v-if="couverture(p)">
              · {{ couverture(p) }}
            </template>
          </div>
        </div>
        <BadgeStatut
          type="paiement"
          :statut="p.statut"
          petit
        />
      </div>
      <div
        v-if="p.statut === 'rejete'"
        class="paiements-declares__rejet"
      >
        <span v-if="motif(p)">Motif : {{ motif(p) }}</span>
        <CzButton
          taille="sm"
          :to="lienDeclarer(p.projetId)"
        >
          Déclarer à nouveau
        </CzButton>
      </div>
    </li>
  </ul>
</template>

<style scoped>
.paiements-declares {
  margin: 0;
  padding: 0;
  list-style: none;
}

.paiements-declares li {
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--divider-row);
}

.paiements-declares__ligne {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-2);
  font-size: 13.5px;
}

.paiements-declares__ligne b {
  color: var(--text-strong);
}

.paiements-declares__rejet {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--r-field);
  background: var(--danger-bg);
  font-size: 13px;
  color: var(--danger-fg);
}
</style>
