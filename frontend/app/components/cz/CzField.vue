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
}>(), { label: undefined, aide: undefined, erreur: undefined, requis: false, id: undefined })

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
      v-if="label"
      class="cz-label"
      :for="id"
    >{{ label }}{{ requis ? ' ' : '' }}<span
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
