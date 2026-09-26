<!-- Démonstration du gabarit back-office super-admin (développement uniquement). -->
<script setup lang="ts">
definePageMeta({ middleware: ['dev-uniquement', 'espace-plateforme'], layout: 'backoffice', espace: 'superadmin', titre: 'Tableau de bord' })
</script>

<template>
  <div class="dev-colonne">
    <EnTetePage
      titre="Tableau de bord"
      sous-titre="Plateforme Cotiz"
    />
    <CzEmpty
      icone="plateforme"
      titre="Contenu de la page"
      description="Les écrans du super-admin arrivent au lot 08."
    />
  </div>
</template>

<style scoped>
.dev-colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}
</style>
