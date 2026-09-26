<!--
  Paiement de la file de validation en mobile : souscripteur, projet et ancienneté, montant et badge,
  moyen et échéances couvertes ; « Voir la preuve » (détail plein écran) et « Valider » quand il est en attente.
-->
<script setup lang="ts">
import type { PaiementListe } from '~~/types'
import { couvertureFile } from '~/utils/echeances'
import { formatFCFA, formatRelatif } from '~/utils/format'
import { STATUTS_PAIEMENT } from '~/utils/statuts'

const props = withDefaults(defineProps<{
  paiement: PaiementListe
  envoi?: boolean
}>(), { envoi: false })

defineEmits<{ valider: [] }>()

const MOYENS_COURTS = { mobile_money: 'Mobile money', virement: 'Virement', especes: 'Espèces' } as const

const nom = computed(() => `${props.paiement.souscripteur.prenom} ${props.paiement.souscripteur.nom}`)
const enAttente = computed(() => props.paiement.statut === 'en_attente')
const badge = computed(() => (enAttente.value ? { libelle: 'À valider', ton: 'warning' as const } : STATUTS_PAIEMENT[props.paiement.statut]))
const couvre = computed(() => couvertureFile(props.paiement, props.paiement.echeancesCouvertes, formatFCFA))
</script>

<template>
  <article class="cz-card carte-file">
    <div class="carte-file__tete">
      <CzAvatar
        :nom="nom"
        taille="sm"
      />
      <div class="carte-file__qui">
        <b class="carte-file__nom">{{ nom }}</b>
        <span class="carte-file__sub">{{ paiement.projet.nom }} · {{ formatRelatif(paiement.declareLe) }}</span>
      </div>
      <div class="carte-file__montant">
        <b>{{ formatFCFA(paiement.montant) }}</b>
        <CzBadge
          :ton="badge.ton"
          petit
        >
          {{ badge.libelle }}
        </CzBadge>
      </div>
    </div>
    <div class="carte-file__couvre">
      {{ MOYENS_COURTS[paiement.moyen] }} · couvre {{ couvre }}
    </div>
    <div class="carte-file__actions">
      <CzButton
        variante="secondaire"
        :to="`/asso/paiements/${paiement.id}`"
        :aria-label="`Voir la preuve du paiement de ${nom}`"
      >
        {{ enAttente ? 'Voir la preuve' : 'Voir le détail' }}
      </CzButton>
      <CzButton
        v-if="enAttente"
        variante="succes"
        :chargement="envoi"
        libelle-chargement="Validation…"
        :aria-label="`Valider le paiement de ${nom}`"
        @click="$emit('valider')"
      >
        Valider
      </CzButton>
    </div>
  </article>
</template>

<style scoped>
.carte-file {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: 14px;
}

.carte-file__tete {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
}

.carte-file__qui {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.carte-file__nom {
  font-weight: 600;
  color: var(--text-strong);
}

.carte-file__sub {
  font-size: 12.5px;
  color: var(--text-muted);
}

.carte-file__montant {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--space-1);
}

.carte-file__montant b {
  font-family: var(--font-display);
  font-size: 16px;
  font-weight: 600;
  color: var(--text-strong);
  white-space: nowrap;
}

.carte-file__couvre {
  font-size: 12.5px;
  color: var(--text-muted);
}

.carte-file__actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.carte-file__actions > :only-child {
  grid-column: 1 / -1;
}
</style>
