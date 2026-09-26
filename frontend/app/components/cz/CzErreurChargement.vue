<!--
  État d'erreur d'un écran ou d'un bloc qui charge des données : icône danger, titre (« Impossible d'afficher… »),
  conseil, bouton « Réessayer » (émet `reessayer`). Le slot `action` remplace le bouton (ex. « Voir les projets » sur 404).
-->
<script setup lang="ts">
withDefaults(defineProps<{
  titre: string
  description?: string
}>(), { description: 'Vérifiez votre connexion, puis réessayez.' })

defineEmits<{ reessayer: [] }>()
</script>

<template>
  <CzEmpty
    icone="alerte"
    ton="danger"
    :titre="titre"
    :description="description"
  >
    <template #action>
      <slot name="action">
        <CzButton
          variante="secondaire"
          @click="$emit('reessayer')"
        >
          Réessayer
        </CzButton>
      </slot>
    </template>
  </CzEmpty>
</template>
