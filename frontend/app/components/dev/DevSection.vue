<!-- Page de démonstration : bloc d'une fiche du design system. -->
<script setup lang="ts">
defineProps<{ id: string, titre: string, source?: string }>()
</script>

<template>
  <section
    :id="id"
    class="dev-section"
  >
    <header class="dev-section__entete">
      <h2 class="cz-h2">
        {{ titre }}
      </h2>
      <code
        v-if="source"
        class="cz-mono cz-muted"
      >{{ source }}</code>
    </header>
    <div class="dev-section__corps">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.dev-section {
  scroll-margin-top: 80px;
}

.dev-section__entete {
  display: flex;
  align-items: baseline;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}

.dev-section__corps {
  background: var(--surface);
  border-radius: var(--r-card);
  box-shadow: var(--shadow);
  overflow: hidden;
}
</style>
