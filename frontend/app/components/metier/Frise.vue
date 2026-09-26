<!--
  Frise d'historique (fiche souscripteur, détail d'un paiement, détail d'une demande).
  Pastille : success validé · warning déclaré / en attente · danger retard · info information · brand neutre.
-->
<script setup lang="ts">
export interface EvenementFrise {
  id?: string
  titre: string
  detail?: string
  ton?: 'success' | 'warning' | 'danger' | 'info' | 'brand'
}

defineProps<{
  evenements: EvenementFrise[]
  label?: string
}>()

const CLASSES = { success: '', warning: 'w', danger: 'l', info: 'i', brand: 'b' } as const
</script>

<template>
  <ol
    class="cz-timeline"
    :aria-label="label"
  >
    <li
      v-for="(e, i) in evenements"
      :key="e.id ?? i"
      class="it"
      :class="CLASSES[e.ton ?? 'success']"
    >
      <b>{{ e.titre }}</b>
      <div
        v-if="e.detail"
        class="m"
      >
        {{ e.detail }}
      </div>
    </li>
  </ol>
</template>

<style scoped>
.cz-timeline {
  margin-top: 0;
  margin-bottom: 0;
  list-style: none;
}
</style>
