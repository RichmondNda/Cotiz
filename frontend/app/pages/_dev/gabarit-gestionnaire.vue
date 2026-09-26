<!-- Démonstration du gabarit back-office gestionnaire (développement uniquement). -->
<script setup lang="ts">
definePageMeta({ middleware: ['dev-uniquement', 'espace-gestionnaire'], layout: 'backoffice', espace: 'gestionnaire', titre: 'Tableau de bord' })
</script>

<template>
  <div class="dev-colonne">
    <EnTeteMobile
      titre="Bonjour Awa"
      sous-titre="Entraide Yopougon"
      class="dev-mobile"
    />
    <EnTetePage
      titre="Bonjour Awa"
      sous-titre="Entraide Yopougon · vendredi 25 septembre 2026"
    >
      <template #actions>
        <CzButton
          taille="lg"
          icone="ajouter"
        >
          Créer un projet
        </CzButton>
      </template>
    </EnTetePage>
    <CzEmpty
      icone="tableau-de-bord"
      titre="Contenu de la page"
      description="Les écrans du gestionnaire arrivent aux lots 04 à 07."
    />
  </div>
</template>

<style scoped>
.dev-colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.dev-mobile {
  display: none;
}

@media (max-width: 767px) {
  .dev-mobile {
    display: flex;
    margin: calc(-1 * var(--space-4)) calc(-1 * var(--space-3)) 0;
  }
}
</style>
