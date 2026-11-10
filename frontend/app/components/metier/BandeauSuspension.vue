<!--
  Bandeau de l'espace souscripteur : association suspendue par Cotiz (décision du 2026-11-10, docs/specs/ui-deviations.md).
  Projets, versements et contrats restent consultables ; aucune déclaration n'est possible (me.declare : association_suspended).
-->
<script setup lang="ts">
const props = defineProps<{ noms: string[] }>()

const sujet = computed(() => (props.noms.length > 1
  ? `Les associations ${props.noms.slice(0, -1).join(', ')} et ${props.noms.at(-1)} sont suspendues`
  : `L’association ${props.noms[0] ?? ''} est suspendue`))
</script>

<template>
  <CzAlert
    v-if="noms.length"
    ton="danger"
  >
    <b>{{ sujet }}.</b> Vos projets, versements et contrats restent consultables, mais aucun paiement ne peut être déclaré
    pour le moment. Contactez votre association.
  </CzAlert>
</template>
