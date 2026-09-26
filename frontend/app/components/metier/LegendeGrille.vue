<!-- Légende de la grille d'échéances : chaque couleur porte son texte (jamais la couleur seule). -->
<script setup lang="ts">
import type { StatutEcheance } from '~~/types'

withDefaults(defineProps<{
  /** Libellés courts (« Déclarée » au lieu de « Déclarée, à valider »). */
  court?: boolean
  /** Symboles affichés dans les cases (option « Afficher les motifs »). */
  motifs?: Partial<Record<StatutEcheance, string>>
}>(), { court: false, motifs: undefined })

const CLASSES: Record<StatutEcheance, string> = {
  payee: 'cz-cell--ok',
  declaree: 'cz-cell--wait',
  partielle: 'cz-cell--part',
  en_retard: 'cz-cell--late',
  a_venir: 'cz-cell--fut',
}
const ENTREES: { statut: StatutEcheance, texte: string, court: string }[] = [
  { statut: 'payee', texte: 'Payée', court: 'Payée' },
  { statut: 'declaree', texte: 'Déclarée, à valider', court: 'Déclarée' },
  { statut: 'partielle', texte: 'Partielle', court: 'Partielle' },
  { statut: 'en_retard', texte: 'En retard', court: 'En retard' },
  { statut: 'a_venir', texte: 'À venir', court: 'À venir' },
]
</script>

<template>
  <div
    class="cz-grid-legend"
    role="list"
    aria-label="Légende de la grille"
  >
    <span
      v-for="e in ENTREES"
      :key="e.statut"
      role="listitem"
    ><span
      class="cz-cell cz-cell--sm"
      :class="CLASSES[e.statut]"
      aria-hidden="true"
    />{{ court ? e.court : e.texte }}<template v-if="motifs?.[e.statut]"> ({{ motifs[e.statut] }})</template></span>
  </div>
</template>
