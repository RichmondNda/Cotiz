<!--
  Élément de notification. Non lue : fond brand-pale et pastille à droite. Icône sur pastille colorée selon le type
  (rappel d'échéance = info, retard = danger, validé = success, rejeté = danger, contrat à signer = warning).
  `action` : libellé de l'écran d'action (« Signer le contrat → »).
  Clic : événement `ouvrir` (la page marque comme lue) puis navigation vers l'écran d'action (`to`).
-->
<script setup lang="ts">
import { NuxtLink } from '#components'
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
  action?: string
}>(), { message: undefined, moment: undefined, lue: false, to: undefined, action: undefined })

const emit = defineEmits<{ ouvrir: [] }>()

type Ton = 'warning' | 'success' | 'danger' | 'info' | 'brand'
const APPARENCE: Record<TypeNotification, { icone: NomIcone, ton: Ton }> = {
  echeance_proche: { icone: 'notification', ton: 'info' },
  echeance_en_retard: { icone: 'alerte', ton: 'danger' },
  paiement_declare: { icone: 'paiement', ton: 'warning' },
  paiement_valide: { icone: 'coche', ton: 'success' },
  paiement_rejete: { icone: 'rejete', ton: 'danger' },
  contrat_a_signer: { icone: 'contrat', ton: 'warning' },
  contrat_signe: { icone: 'contrat', ton: 'success' },
  relance: { icone: 'relance', ton: 'warning' },
  abonnement: { icone: 'facturation', ton: 'info' },
  inscriptions: { icone: 'souscripteurs', ton: 'info' },
}
const apparence = computed(() => APPARENCE[props.type])
</script>

<template>
  <component
    :is="to ? NuxtLink : 'button'"
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
      <div
        v-if="action"
        class="notif__action"
      >
        {{ action }} →
      </div>
    </div>
    <span
      v-if="moment"
      class="tm"
    >{{ moment }}</span>
    <span
      v-if="!lue"
      class="unread-dot"
      aria-hidden="true"
    />
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
  flex: 1;
  min-width: 0;
}

.notif__action {
  margin-top: var(--space-1);
  font-size: 12.5px;
  font-weight: 600;
  color: var(--brand-dark);
}

.ic--warning { background: var(--warning-bg); color: var(--warning-fg); }
.ic--success { background: var(--success-bg); color: var(--success-fg); }
.ic--danger { background: var(--danger-bg); color: var(--danger-fg); }
.ic--info { background: var(--info-bg); color: var(--info-fg); }
.ic--brand { background: var(--brand-pale); color: var(--brand-dark); }
</style>
