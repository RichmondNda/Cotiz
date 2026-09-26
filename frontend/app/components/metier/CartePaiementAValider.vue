<!-- Paiement déclaré en attente (onglet Paiements d'un projet) : qui, quand, combien, ce qu'il couvre, « Examiner ». -->
<script setup lang="ts">
import type { PaiementListe } from '~~/types'
import { formatFCFA, formatRelatif } from '~/utils/format'

defineProps<{
  paiement: PaiementListe
  /** « Sept., oct., nov. », « Solde d’août ». */
  couverture: string
}>()

defineEmits<{ examiner: [] }>()
</script>

<template>
  <article class="cz-card a-valider">
    <div class="cz-person">
      <CzAvatar
        :nom="`${paiement.souscripteur.prenom} ${paiement.souscripteur.nom}`"
        taille="sm"
      />
      <div>
        <b>{{ paiement.souscripteur.prenom }} {{ paiement.souscripteur.nom }}</b>
        <div class="sub">
          {{ formatRelatif(paiement.declareLe, { style: 'long' }) }}
        </div>
      </div>
    </div>
    <div class="a-valider__montant">
      {{ formatFCFA(paiement.montant) }}
    </div>
    <div class="a-valider__couvre">
      {{ couverture }}
    </div>
    <CzButton
      variante="secondaire"
      taille="sm"
      :aria-label="`Examiner le paiement de ${paiement.souscripteur.prenom} ${paiement.souscripteur.nom}`"
      @click="$emit('examiner')"
    >
      Examiner
    </CzButton>
  </article>
</template>

<style scoped>
.a-valider {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: 14px;
}

.a-valider__montant {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.a-valider__couvre {
  font-size: 12.5px;
  color: var(--text-muted);
}
</style>
