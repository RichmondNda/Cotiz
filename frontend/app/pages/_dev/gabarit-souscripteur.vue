<!-- Démonstration du gabarit souscripteur (développement uniquement). -->
<script setup lang="ts">
definePageMeta({ middleware: ['dev-uniquement', 'espace-souscripteur'], layout: 'souscripteur' })
</script>

<template>
  <div class="dev-colonne">
    <h1 class="dev-h1">
      Bonjour Moussa
    </h1>
    <CzEmpty
      icone="mon-espace"
      titre="Contenu de la page"
      description="Les écrans du souscripteur arrivent au lot 03."
    />
  </div>
</template>

<style scoped>
.dev-colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.dev-h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 32px;
  font-weight: 600;
  color: var(--text-strong);
}
</style>
