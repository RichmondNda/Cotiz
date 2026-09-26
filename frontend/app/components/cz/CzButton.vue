<!--
  Bouton du design system (`cz-btn`). Rend un <button>, un <NuxtLink> (`to`) ou un <a> (`href`).
  Primaire : une seule par zone visible. Succès : « Valider le paiement ». Danger : toujours suivi d'une confirmation.
  Icône seule (`variante="icone"`) : `label` obligatoire (infobulle + aria-label).
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { NomIcone } from '~/utils/icons'

export type VarianteBouton = 'primaire' | 'secondaire' | 'fantome' | 'succes' | 'danger' | 'danger-contour' | 'blanc' | 'icone'

const props = withDefaults(defineProps<{
  variante?: VarianteBouton
  taille?: 'sm' | 'md' | 'lg'
  bloc?: boolean
  icone?: NomIcone
  iconeDroite?: NomIcone
  /** Affiche le spinner ; `libelleChargement` au participe présent (« Enregistrement… »). */
  chargement?: boolean
  libelleChargement?: string
  disabled?: boolean
  to?: RouteLocationRaw
  href?: string
  type?: 'button' | 'submit' | 'reset'
  /** Libellé accessible (obligatoire pour un bouton icône, affiché en infobulle). */
  label?: string
  /** Bouton icône sans bordure ni fond au repos (actions de ligne ⋯). */
  nu?: boolean
}>(), {
  variante: 'primaire',
  taille: 'md',
  bloc: false,
  icone: undefined,
  iconeDroite: undefined,
  chargement: false,
  libelleChargement: undefined,
  disabled: false,
  to: undefined,
  href: undefined,
  type: 'button',
  label: undefined,
  nu: false,
})

const MODIFICATEURS: Record<VarianteBouton, string | null> = {
  'primaire': null,
  'secondaire': 'cz-btn--secondary',
  'fantome': 'cz-btn--ghost',
  'succes': 'cz-btn--success',
  'danger': 'cz-btn--danger',
  'danger-contour': 'cz-btn--danger-outline',
  'blanc': 'cz-btn--white',
  'icone': 'cz-btn--icon',
}

const classes = computed(() => [
  'cz-btn',
  MODIFICATEURS[props.variante],
  props.taille !== 'md' && `cz-btn--${props.taille}`,
  props.bloc && 'cz-btn--block',
  props.chargement && 'is-loading',
  props.disabled && (props.to || props.href) && 'is-disabled',
  props.nu && 'is-nu',
])

const estIcone = computed(() => props.variante === 'icone')
const inactif = computed(() => props.disabled || props.chargement)
</script>

<template>
  <NuxtLink
    v-if="to && !inactif"
    :to="to"
    :class="classes"
    :aria-label="label"
    :title="estIcone ? label : undefined"
  >
    <CzIcon
      v-if="icone"
      :nom="icone"
    />
    <slot />
    <CzIcon
      v-if="iconeDroite"
      :nom="iconeDroite"
    />
  </NuxtLink>
  <a
    v-else-if="href && !inactif"
    :href="href"
    :class="classes"
    :aria-label="label"
    :title="estIcone ? label : undefined"
  >
    <CzIcon
      v-if="icone"
      :nom="icone"
    />
    <slot />
    <CzIcon
      v-if="iconeDroite"
      :nom="iconeDroite"
    />
  </a>
  <button
    v-else
    :type="type"
    :class="classes"
    :disabled="disabled || undefined"
    :aria-disabled="chargement || undefined"
    :aria-busy="chargement || undefined"
    :aria-label="label"
    :title="estIcone ? label : undefined"
  >
    <template v-if="chargement">
      <CzSpinner />
      <template v-if="!estIcone">
        {{ libelleChargement }}<slot v-if="!libelleChargement" />
      </template>
    </template>
    <template v-else>
      <CzIcon
        v-if="icone"
        :nom="icone"
      />
      <slot />
      <CzIcon
        v-if="iconeDroite"
        :nom="iconeDroite"
      />
    </template>
  </button>
</template>

<style scoped>
.cz-btn--icon.is-nu {
  --_bg: transparent;
  --_bd: transparent;
}
</style>
