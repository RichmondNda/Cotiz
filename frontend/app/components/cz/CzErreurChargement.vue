<!--
  État d'erreur d'un écran ou d'un bloc qui charge des données : icône danger, titre (« Impossible d'afficher… »),
  conseil, bouton « Réessayer » (émet `reessayer`). Le slot `action` remplace le bouton.
  Avec `erreur` + `introuvable` : si l'API répond 404, variante « X introuvable » (icône recherche, ton neutre)
  et lien de retour vers la liste au lieu de « Réessayer ».
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(defineProps<{
  titre: string
  description?: string
  /** Erreur renvoyée par `useApi` : seul son `statusCode` est lu. */
  erreur?: unknown
  introuvable?: { titre: string, description: string, retour: { label: string, to: RouteLocationRaw } }
}>(), { description: 'Vérifiez votre connexion, puis réessayez.', erreur: undefined, introuvable: undefined })

defineEmits<{ reessayer: [] }>()

const est404 = computed(() => !!props.introuvable && (props.erreur as { statusCode?: number } | null | undefined)?.statusCode === 404)
</script>

<template>
  <CzEmpty
    v-if="est404 && introuvable"
    icone="recherche"
    ton="neutral"
    :titre="introuvable.titre"
    :description="introuvable.description"
  >
    <template #action>
      <CzButton
        variante="secondaire"
        :to="introuvable.retour.to"
      >
        {{ introuvable.retour.label }}
      </CzButton>
    </template>
  </CzEmpty>
  <CzEmpty
    v-else
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
