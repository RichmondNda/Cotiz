<!-- Badge d'un statut métier, via la table de correspondance du design system (utils/statuts). -->
<script setup lang="ts">
import { libelleStatut, type TypeStatut } from '~/utils/statuts'

const props = withDefaults(defineProps<{
  type: TypeStatut
  statut: string
  /** Complément après le libellé : « En retard · 2 ». */
  complement?: string | number
  petit?: boolean
  point?: boolean
}>(), { complement: undefined, petit: false, point: false })

const s = computed(() => libelleStatut(props.type, props.statut))
</script>

<template>
  <CzBadge
    :ton="s.ton"
    :petit="petit"
    :point="point"
  >
    {{ s.libelle }}<template v-if="complement !== undefined">
      · {{ complement }}
    </template>
  </CzBadge>
</template>
