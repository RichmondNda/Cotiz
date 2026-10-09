<!--
  Affiche son contenu si la fonctionnalité est active pour la session (`GET /me` → `features`), sinon l'état
  « Bientôt disponible » (slot `indisponible`, badge CzSoon par défaut). Rien tant que la session n'est pas chargée.
  Le front masque, le back refuse (`feature_disabled`).
-->
<script setup lang="ts">
import type { Feature } from '@cotiz/contracts'

const props = defineProps<{ feature: Feature }>()
const { active, pret } = usePermissions()
</script>

<template>
  <template v-if="pret">
    <slot v-if="active(props.feature)" />
    <slot
      v-else
      name="indisponible"
    >
      <CzSoon />
    </slot>
  </template>
</template>
