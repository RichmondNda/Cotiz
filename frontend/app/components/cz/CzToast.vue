<!-- Toast `cz-toast` : icône de ton, titre, message, action (« Annuler », « Réessayer »). -->
<script setup lang="ts">
import type { NomIcone } from '~/utils/icons'
import type { TonToast } from '~/composables/useToast'

const props = withDefaults(defineProps<{
  ton?: TonToast
  titre: string
  message?: string
  action?: string
  icone?: NomIcone
}>(), { ton: 'success', message: undefined, action: undefined, icone: undefined })

defineEmits<{ action: [], fermer: [] }>()

const ICONES: Record<TonToast, NomIcone> = { success: 'valide', danger: 'rejete', warning: 'en-attente', info: 'information' }
const iconeAffichee = computed(() => props.icone ?? ICONES[props.ton])
</script>

<template>
  <div
    class="cz-toast"
    :class="ton !== 'success' && `cz-toast--${ton}`"
    :role="ton === 'danger' ? 'alert' : 'status'"
  >
    <span class="ic"><CzIcon :nom="iconeAffichee" /></span>
    <div>
      <div class="ttl">
        {{ titre }}
      </div>
      <div
        v-if="message"
        class="msg"
      >
        {{ message }}
      </div>
    </div>
    <button
      v-if="action"
      type="button"
      class="act"
      @click="$emit('action')"
    >
      {{ action }}
    </button>
  </div>
</template>

<style scoped>
.act {
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
}

.act:focus-visible {
  outline: none;
  border-radius: var(--r-xs);
  box-shadow: var(--focus-ring);
}
</style>
