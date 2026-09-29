<!--
  Quota d'abonnement utilisé : « Projets    3 / 5 » et barre de progression (orange dès 90 %).
  La limite peut être illimitée (`null`) ou un placeholder de la maquette (`[N]`).
-->
<script setup lang="ts">
import type { QuotaUtilise } from '~~/types'

const props = defineProps<{
  libelle: string
  quota: QuotaUtilise
}>()

const limite = computed(() => (props.quota.limite === null ? 'illimité' : String(props.quota.limite)))
</script>

<template>
  <div class="quota">
    <div class="quota__l">
      <span>{{ libelle }}</span><b>{{ quota.utilise }} / {{ limite }}</b>
    </div>
    <CzProgress
      :valeur="quota.pourcentage"
      :ton="quota.pourcentage >= 90 ? 'warning' : 'brand'"
      :label="`${libelle} : ${quota.utilise} sur ${limite}`"
    />
  </div>
</template>

<style scoped>
.quota {
  font-size: 13px;
}

.quota__l {
  display: flex;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}
</style>
