<!-- Coquille (lot 02) : cible de la connexion plateforme. Tableau de bord plateforme au lot 08. -->
<script setup lang="ts">
definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Tableau de bord' })
</script>

<template>
  <CzEmpty
    icone="plateforme"
    titre="Tableau de bord"
    description="Le tableau de bord plateforme arrive au lot 08."
  />
</template>
