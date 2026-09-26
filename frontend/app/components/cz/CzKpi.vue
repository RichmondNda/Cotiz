<!--
  Indicateur clé : pastille d'icône + libellé, valeur en grand, ligne de contexte.
  Pastille brand par défaut, ou ton de statut quand le chiffre en est un (à valider = warning, retards = danger).
  Cliquable (`to`) : mène vers la liste filtrée correspondante. `chargement` : squelette de même forme.
-->
<script setup lang="ts">
import { NuxtLink } from '#components'
import type { RouteLocationRaw } from 'vue-router'
import type { NomIcone } from '~/utils/icons'

const props = withDefaults(defineProps<{
  libelle?: string
  valeur?: string | number
  detail?: string
  icone?: NomIcone
  ton?: 'brand' | 'success' | 'warning' | 'danger'
  /** Couleur de la ligne de contexte : up (success) · warn · bad (danger). */
  tonDetail?: 'up' | 'warn' | 'bad'
  iconeDetail?: NomIcone
  to?: RouteLocationRaw
  chargement?: boolean
}>(), {
  libelle: '',
  valeur: '',
  detail: undefined,
  icone: undefined,
  ton: 'brand',
  tonDetail: undefined,
  iconeDetail: undefined,
  to: undefined,
  chargement: false,
})

const racine = computed(() => (props.to && !props.chargement ? NuxtLink : 'div'))
</script>

<template>
  <component
    :is="racine"
    :to="to && !chargement ? to : undefined"
    class="cz-kpi"
    :class="{ 'is-clickable': to }"
    :aria-busy="chargement || undefined"
  >
    <template v-if="chargement">
      <CzSkeleton
        :hauteur="14"
        largeur="60%"
      />
      <CzSkeleton
        :hauteur="28"
        largeur="80%"
        class="cz-kpi__skel"
      />
      <CzSkeleton
        :hauteur="10"
        largeur="45%"
        class="cz-kpi__skel"
      />
    </template>
    <template v-else>
      <div class="l">
        <span
          v-if="icone"
          class="ic"
          :class="ton !== 'brand' && `ic--${ton}`"
        ><CzIcon :nom="icone" /></span>
        {{ libelle }}
      </div>
      <div class="v">
        <slot name="valeur">
          {{ valeur }}
        </slot>
      </div>
      <div
        v-if="detail || $slots.detail"
        class="d"
        :class="tonDetail"
      >
        <CzIcon
          v-if="iconeDetail"
          :nom="iconeDetail"
        />
        <slot name="detail">
          {{ detail }}
        </slot>
      </div>
    </template>
  </component>
</template>

<style scoped>
a.cz-kpi {
  display: block;
  color: inherit;
  text-decoration: none;
}

.cz-kpi.is-clickable:focus-visible {
  outline: none;
  box-shadow: var(--shadow), 0 0 0 3px var(--brand);
}

.cz-kpi__skel {
  margin-top: var(--space-3);
}
</style>
