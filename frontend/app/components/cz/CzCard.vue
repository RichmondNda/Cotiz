<!--
  Carte : blanc, r-card, ombre douce, padding 24 (16–18 sur mobile).
  Variantes : standard · flat (contour) · tinted (teintée) · lg (souscripteur, r-card-lg) · ghost (« + Nouveau projet »).
  Cliquable (`to` ou `cliquable`) : survol shadow-hover, focus anneau 3 px brand. `selectionnee` : contour 2 px brand.
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

const props = withDefaults(defineProps<{
  variante?: 'standard' | 'flat' | 'tinted' | 'lg' | 'ghost'
  to?: RouteLocationRaw
  cliquable?: boolean
  selectionnee?: boolean
  desactivee?: boolean
  titre?: string
  sousTitre?: string
  tag?: string
}>(), {
  variante: 'standard',
  to: undefined,
  cliquable: false,
  selectionnee: false,
  desactivee: false,
  titre: undefined,
  sousTitre: undefined,
  tag: 'div',
})

const emit = defineEmits<{ click: [MouseEvent | KeyboardEvent] }>()

/**
 * Entrée / Espace sur la carte cliquable elle-même seulement : une touche venue d'un champ ou d'un bouton de la carte
 * (formulaire de création de projet…) garde son effet normal (taper un espace, valider).
 */
function touche(e: KeyboardEvent) {
  if (!props.cliquable || props.desactivee || e.target !== e.currentTarget) return
  e.preventDefault()
  emit('click', e)
}

const estCliquable = computed(() => Boolean(props.to) || props.cliquable)
const classes = computed(() => [
  'cz-card',
  props.variante !== 'standard' && `cz-card--${props.variante}`,
  estCliquable.value && 'is-clickable',
  props.selectionnee && 'is-selected',
  props.desactivee && 'is-disabled',
])
</script>

<template>
  <NuxtLink
    v-if="to && !desactivee"
    :to="to"
    :class="classes"
  >
    <p
      v-if="titre"
      class="cz-card-t"
    >
      {{ titre }}
    </p>
    <p
      v-if="sousTitre"
      class="cz-card-s"
    >
      {{ sousTitre }}
    </p>
    <slot />
  </NuxtLink>
  <component
    :is="tag"
    v-else
    :class="classes"
    :role="cliquable ? 'button' : undefined"
    :tabindex="cliquable && !desactivee ? 0 : undefined"
    :aria-pressed="cliquable && selectionnee ? true : undefined"
    :aria-disabled="desactivee || undefined"
    @click="cliquable && !desactivee && emit('click', $event)"
    @keydown.enter="touche"
    @keydown.space="touche"
  >
    <p
      v-if="titre"
      class="cz-card-t"
    >
      {{ titre }}
    </p>
    <p
      v-if="sousTitre"
      class="cz-card-s"
    >
      {{ sousTitre }}
    </p>
    <slot />
  </component>
</template>

<style scoped>
a.cz-card {
  display: block;
  color: inherit;
  text-decoration: none;
}

a.cz-card.cz-card--ghost {
  color: var(--brand-dark);
}

a.cz-card.cz-card--ghost {
  display: flex;
}

.cz-card.is-clickable:focus-visible {
  outline: none;
  box-shadow: var(--shadow), 0 0 0 3px var(--brand);
}

@media (max-width: 767px) {
  .cz-card {
    padding: var(--space-4);
  }
}
</style>
