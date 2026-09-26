<!-- Site public : en-tête, contenu (sections alternées corail-page / blanc), pied de page. -->
<script setup lang="ts">
useHead({ bodyAttrs: { 'data-theme': 'manager' } })
</script>

<template>
  <div
    class="gabarit-public"
    data-theme="manager"
  >
    <PublicHeader />
    <main class="gabarit-public__contenu">
      <slot />
    </main>
    <PublicFooter />
  </div>
</template>

<style scoped>
.gabarit-public {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--surface);
}

.gabarit-public__contenu {
  flex: 1;
}
</style>
