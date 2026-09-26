<!--
  Bandeau d'alerte dans la page : fond -bg, texte -fg du ton. Lien d'action souligné en fin de phrase
  (slot `lien` ou prop `lien` + `to`), ou bouton à droite (slot `action`).
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { NomIcone } from '~/utils/icons'

const props = withDefaults(defineProps<{
  ton?: 'warning' | 'danger' | 'info' | 'success'
  icone?: NomIcone
  lien?: string
  to?: RouteLocationRaw
}>(), { ton: 'info', icone: undefined, lien: undefined, to: undefined })

defineEmits<{ lien: [] }>()

const ICONES_PAR_TON: Record<string, NomIcone> = {
  warning: 'en-attente',
  danger: 'alerte',
  info: 'information',
  success: 'valide',
}
const iconeAffichee = computed(() => props.icone ?? ICONES_PAR_TON[props.ton]!)
</script>

<template>
  <div
    class="cz-alert"
    :class="[`cz-alert--${ton}`, { 'has-action': $slots.action }]"
    :role="ton === 'danger' ? 'alert' : 'status'"
  >
    <CzIcon :nom="iconeAffichee" />
    <div class="cz-alert__texte">
      <slot />
      <template v-if="lien">
        {{ ' ' }}<NuxtLink
          v-if="to"
          :to="to"
          class="cz-alert__lien"
        >{{ lien }}</NuxtLink><button
          v-else
          type="button"
          class="cz-alert__lien"
          @click="$emit('lien')"
        >
          {{ lien }}
        </button>
      </template>
    </div>
    <div
      v-if="$slots.action"
      class="act"
    >
      <slot name="action" />
    </div>
  </div>
</template>

<style scoped>
.cz-alert.has-action {
  align-items: center;
}

.cz-alert__texte {
  flex: 1;
  min-width: 0;
}

.cz-alert__lien {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-weight: 600;
  color: inherit;
  text-decoration: underline;
  cursor: pointer;
}
</style>
