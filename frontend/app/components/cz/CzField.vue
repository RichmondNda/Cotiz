<!--
  Champ de formulaire : `cz-field` > `cz-label` (astérisque danger si obligatoire) + contrôle + `cz-help` ou `cz-error`.
  Le contrôle placé dans le slot (CzInput, CzSelect…) reçoit automatiquement l'id et aria-describedby.
  Validation à la perte de focus, jamais à chaque frappe (responsabilité de la page).
-->
<script setup lang="ts">
import { CLE_CHAMP } from '~/composables/useChamp'

const props = withDefaults(defineProps<{
  label?: string
  aide?: string
  /** Message d'erreur : met le champ en erreur. */
  erreur?: string
  requis?: boolean
  id?: string
  /** Libellé lu par les lecteurs d'écran mais non affiché (champ dont la maquette ne montre que le placeholder). */
  libelleMasque?: boolean
}>(), { label: undefined, aide: undefined, erreur: undefined, requis: false, id: undefined, libelleMasque: false })

const id = props.id ?? `cz-${useId()}`
const idAide = `${id}-aide`

provide(CLE_CHAMP, {
  id,
  decritPar: computed(() => (props.erreur || props.aide ? idAide : undefined)),
  enErreur: computed(() => Boolean(props.erreur)),
  requis: computed(() => props.requis),
})
</script>

<template>
  <div class="cz-field">
    <label
      v-if="label || $slots.label"
      class="cz-label"
      :class="{ 'sr-only': libelleMasque }"
      :for="id"
    >
      <slot name="label">{{ label }}</slot>{{ requis ? ' ' : '' }}<span
        v-if="requis"
        class="req"
        aria-hidden="true"
      >*</span></label>
    <slot :id="id" />
    <span
      v-if="erreur"
      :id="idAide"
      class="cz-error"
    ><CzIcon nom="alerte" />{{ erreur }}</span>
    <span
      v-else-if="aide || $slots.aide"
      :id="idAide"
      class="cz-help"
    ><slot name="aide">{{ aide }}</slot></span>
  </div>
</template>
