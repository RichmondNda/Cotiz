<!--
  Aperçu côté souscripteur pendant la création d'un projet : carte projet telle que la verra le souscripteur
  (thème member, fond corail), mise à jour en direct, puis mini-échéancier
  « Entrée 50 000 F · puis 25 000 F / mois × 18 · Total 500 000 F ». Non interactif (`inert`).
-->
<script setup lang="ts">
import type { Frequence } from '~~/types'
import { formatFCFA } from '~/utils/format'
import { UNITES_FREQUENCE } from '~/utils/echeancier'

const props = defineProps<{
  nom: string
  association: string
  fondsEntree: number | null
  montantEcheance: number | null
  frequence: Frequence
  nbEcheances: number | null
  total: number | null
}>()

const montant = computed(() => props.total ?? props.montantEcheance ?? 0)
const premiere = computed(() => {
  if (props.fondsEntree) return `${formatFCFA(props.fondsEntree)} · entrée`
  return props.montantEcheance ? formatFCFA(props.montantEcheance) : '—'
})
</script>

<template>
  <aside
    class="apercu"
    aria-label="Aperçu côté souscripteur"
  >
    <div class="apercu__titre">
      Aperçu côté souscripteur
    </div>
    <div
      class="apercu__fond"
      data-theme="member"
      inert
    >
      <CarteProjet
        vue="souscripteur"
        :nom="nom || 'Nom du projet'"
        :sous-titre="association"
        :badge="{ texte: 'À venir', ton: 'info' }"
        :libelle-montant="total !== null ? 'Reste à payer' : 'Par échéance'"
        :montant="montant"
        :progression="0"
        progression-gauche="0 F versé"
        :progression-droite="total !== null ? `sur ${formatFCFA(total)}` : undefined"
        :pied="{ libelle: 'Première échéance', valeur: premiere }"
        :action="{ label: 'Déclarer' }"
      />
    </div>
    <p class="apercu__mini">
      <template v-if="fondsEntree">
        Entrée <b>{{ formatFCFA(fondsEntree) }}</b> · puis
      </template>
      <b>{{ montantEcheance ? formatFCFA(montantEcheance) : '—' }} / {{ UNITES_FREQUENCE[frequence] }}<template v-if="nbEcheances"> × {{ nbEcheances }}</template></b>
      <template v-if="total !== null">
        · Total <b>{{ formatFCFA(total) }}</b>
      </template>
      <template v-else>
        · sans date de fin
      </template>
    </p>
  </aside>
</template>

<style scoped>
.apercu {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.apercu__titre {
  font-family: var(--font-display);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.apercu__fond {
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--page);
}

.apercu__mini {
  margin: 0;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--r-md);
  background: var(--surface);
  font-size: 13.5px;
  color: var(--text);
}
</style>
