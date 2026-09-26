<!--
  Avatar : initiales sur fond pâle — rond pour une personne, carré arrondi (`org`) pour une association.
  Tailles : lg 56 (profil) · md 36 (défaut) · sm 30 (tableau, piles) ; org 44.
  Ton : brand (défaut) ou teinte de statut ; `sa` = vue super-admin (indigo).
-->
<script setup lang="ts">
import { initiales as calculerInitiales } from '~/utils/format'

const props = withDefaults(defineProps<{
  /** Nom complet : sert aux initiales et au texte alternatif. */
  nom?: string
  /** Initiales imposées (ex. « +48 » dans une pile). */
  initiales?: string
  taille?: 'sm' | 'md' | 'lg'
  org?: boolean
  ton?: 'brand' | 'success' | 'danger' | 'warning' | 'sa'
  src?: string
}>(), { nom: '', initiales: undefined, taille: 'md', org: false, ton: 'brand', src: undefined })

const texte = computed(() => props.initiales ?? calculerInitiales(props.nom))
</script>

<template>
  <span
    class="cz-avatar"
    :class="[
      taille !== 'md' && `cz-avatar--${taille}`,
      org && 'cz-avatar--org',
      ton !== 'brand' && `cz-avatar--${ton}`,
    ]"
    :title="nom || undefined"
  >
    <img
      v-if="src"
      :src="src"
      :alt="nom"
      class="cz-avatar__img"
    >
    <template v-else>
      <span aria-hidden="true">{{ texte }}</span>
      <span
        v-if="nom"
        class="sr-only"
      >{{ nom }}</span>
    </template>
  </span>
</template>

<style scoped>
.cz-avatar__img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: inherit;
}
</style>
