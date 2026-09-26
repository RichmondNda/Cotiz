<!-- Démonstration du gabarit public (développement uniquement). -->
<script setup lang="ts">
definePageMeta({ middleware: 'dev-uniquement', layout: 'public' })
</script>

<template>
  <section class="cz-section alt">
    <h2>Contenu de la page</h2>
    <p class="cz-help dev-centre">
      Les sections alternent corail-page et blanc (lot 02).
    </p>
  </section>
</template>

<style scoped>
.dev-centre {
  text-align: center;
}
</style>
