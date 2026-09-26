<!-- Coquille (lot 02) : cible de la connexion gestionnaire. Tableau de bord gestionnaire au lot 04. -->
<script setup lang="ts">
definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Tableau de bord' })
</script>

<template>
  <CzEmpty
    icone="tableau-de-bord"
    titre="Tableau de bord"
    description="Le tableau de bord gestionnaire arrive au lot 04."
  />
</template>
