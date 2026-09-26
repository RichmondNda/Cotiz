<!--
  Élément de notification. Non lue : fond brand-pale. Icône sur pastille colorée selon le type
  (échéance = warning, validé = success, rejeté = danger, contrat = identité).
  Clic : événement `ouvrir` (la page marque comme lue) puis navigation vers l'écran d'action (`to`).
-->
<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import type { TypeNotification } from '~~/types'
import type { NomIcone } from '~/utils/icons'

const props = withDefaults(defineProps<{
  type: TypeNotification
  titre: string
  message?: string
  /** Moment affiché à droite (« il y a 2 h », « lun. »). */
  moment?: string
  lue?: boolean
  to?: RouteLocationRaw
}>(), { message: undefined, moment: undefined, lue: false, to: undefined })

const emit = defineEmits<{ ouvrir: [] }>()

type Ton = 'warning' | 'success' | 'danger' | 'info' | 'brand'
const APPARENCE: Record<TypeNotification, { icone: NomIcone, ton: Ton }> = {
  echeance_proche: { icone: 'en-attente', ton: 'warning' },
  echeance_en_retard: { icone: 'alerte', ton: 'danger' },
  paiement_declare: { icone: 'paiement', ton: 'warning' },
  paiement_valide: { icone: 'valide', ton: 'success' },
  paiement_rejete: { icone: 'rejete', ton: 'danger' },
  contrat_a_signer: { icone: 'contrat', ton: 'brand' },
  contrat_signe: { icone: 'contrat', ton: 'success' },
  relance: { icone: 'relance', ton: 'warning' },
  abonnement: { icone: 'facturation', ton: 'info' },
  inscriptions: { icone: 'souscripteurs', ton: 'info' },
}
const apparence = computed(() => APPARENCE[props.type])
</script>

<template>
  <component
    :is="to ? resolveComponent('NuxtLink') : 'button'"
    :to="to"
    :type="to ? undefined : 'button'"
    class="cz-notif"
    :class="{ 'is-unread': !lue }"
    @click="emit('ouvrir')"
  >
    <span
      class="ic"
      :class="`ic--${apparence.ton}`"
    ><CzIcon :nom="apparence.icone" /></span>
    <div class="notif__texte">
      <div class="tt">
        {{ titre }}<span
          v-if="!lue"
          class="sr-only"
        > (non lue)</span>
      </div>
      <div
        v-if="message"
        class="ds"
      >
        {{ message }}
      </div>
    </div>
    <span
      v-if="moment"
      class="tm"
    >{{ moment }}</span>
  </component>
</template>

<style scoped>
.cz-notif {
  width: 100%;
  border: 0;
  font: inherit;
  text-align: left;
  color: inherit;
  text-decoration: none;
}

.cz-notif:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.notif__texte {
  min-width: 0;
}

.ic--warning { background: var(--warning-bg); color: var(--warning-fg); }
.ic--success { background: var(--success-bg); color: var(--success-fg); }
.ic--danger { background: var(--danger-bg); color: var(--danger-fg); }
.ic--info { background: var(--info-bg); color: var(--info-fg); }
.ic--brand { background: var(--brand-pale); color: var(--brand-dark); }
</style>
