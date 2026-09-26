<!-- En-tête de page applicative : un seul H1 (28 px), sous-titre, actions à droite (primaire le plus à droite). -->
<script setup lang="ts">
withDefaults(defineProps<{
  titre: string
  sousTitre?: string
}>(), { sousTitre: undefined })
</script>

<template>
  <div class="cz-pagehead entete-page">
    <div class="entete-page__textes">
      <div
        v-if="$slots.avant"
        class="entete-page__avant"
      >
        <slot name="avant" />
      </div>
      <h1>
        {{ titre }}<slot name="apres-titre" />
      </h1>
      <p v-if="sousTitre || $slots.sousTitre">
        <slot name="sousTitre">
          {{ sousTitre }}
        </slot>
      </p>
    </div>
    <div
      v-if="$slots.actions"
      class="end"
    >
      <slot name="actions" />
    </div>
  </div>
</template>

<style scoped>
.entete-page__textes {
  min-width: 0;
}

.entete-page h1 {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-3);
}

@media (max-width: 767px) {
  .entete-page {
    flex-direction: column;
    align-items: stretch;
  }

  .entete-page h1 {
    font-size: 24px;
  }

  .entete-page .end {
    margin-left: 0;
  }
}
</style>
