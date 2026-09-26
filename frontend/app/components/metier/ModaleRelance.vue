<!--
  Relance ponctuelle de souscripteurs en retard : message modifiable (le montant dû de chacun est ajouté
  automatiquement) et canal (notification dans l'espace souscripteur ; SMS et email en V2).
  Desktop : modale « Relancer 3 souscripteurs » / « Relancer Moussa Diarra ». Mobile : feuille basse.
  Émet `envoyer` avec le message ; `envoi` affiche le chargement du bouton.
-->
<script setup lang="ts">
import { pluriel } from '~/utils/format'

const props = withDefaults(defineProps<{
  /** Noms des souscripteurs à relancer. */
  noms: string[]
  /** Projet cité dans le message (« Centre communautaire »). */
  projet?: string
  association?: string
  envoi?: boolean
}>(), { projet: undefined, association: undefined, envoi: false })

const ouvert = defineModel<boolean>('ouvert', { default: false })
const emit = defineEmits<{ envoyer: [message: string] }>()

const { estMobile } = useBreakpoint()
const message = ref('')

const cible = computed(() => (props.noms.length === 1 ? props.noms[0]! : pluriel(props.noms.length, 'souscripteur')))
const modele = computed(() => [
  `Bonjour, nous n’avons pas encore reçu vos échéances en retard${props.projet ? ` pour le projet ${props.projet}` : ''}.`,
  'Merci de régulariser et de déclarer votre paiement sur Cotiz.',
  props.association ? `— ${props.association}` : '',
].filter(Boolean).join(' '))

watch(ouvert, (o) => {
  if (o) message.value = modele.value
})

const CANAUX = [
  { label: 'Notification', disponible: true },
  { label: 'SMS · V2', disponible: false },
  { label: 'Email · V2', disponible: false },
]
</script>

<template>
  <CzSheet
    v-if="estMobile"
    v-model:ouvert="ouvert"
    :titre="`Relancer ${noms.length === 1 ? noms[0] : `${noms.length} souscripteur(s)`}`"
  >
    <div class="relance">
      <CzField
        label="Message"
        libelle-masque
      >
        <CzInput
          v-model="message"
          type="textarea"
          :lignes="5"
        />
      </CzField>
      <p class="relance__aide">
        Le montant dû de chaque souscripteur est ajouté automatiquement. Envoi par notification Cotiz (SMS et email en V2).
      </p>
    </div>
    <template #pied>
      <CzButton
        variante="fantome"
        @click="ouvert = false"
      >
        Annuler
      </CzButton>
      <CzButton
        :chargement="envoi"
        libelle-chargement="Envoi…"
        :disabled="!message.trim()"
        @click="emit('envoyer', message.trim())"
      >
        Envoyer la relance
      </CzButton>
    </template>
  </CzSheet>

  <CzModal
    v-else
    v-model:ouvert="ouvert"
    :titre="`Relancer ${cible}`"
    taille="md"
    sans-feuille
  >
    <div class="relance">
      <CzField
        label="Message"
        aide="Le montant dû de chaque souscripteur est ajouté automatiquement."
      >
        <CzInput
          v-model="message"
          type="textarea"
          :lignes="5"
        />
      </CzField>
      <div class="cz-field">
        <span
          id="relance-canal"
          class="cz-label"
        >Canal</span>
        <div
          class="cz-seg relance__canaux"
          role="radiogroup"
          aria-labelledby="relance-canal"
        >
          <span
            v-for="c in CANAUX"
            :key="c.label"
            role="radio"
            :aria-checked="c.disponible"
            :aria-disabled="!c.disponible || undefined"
            :class="{ 'is-on': c.disponible, 'is-disabled': !c.disponible }"
            :title="c.disponible ? undefined : 'Disponible en V2'"
            :tabindex="c.disponible ? 0 : -1"
          >{{ c.label }}</span>
        </div>
      </div>
    </div>
    <template #pied>
      <CzButton
        variante="fantome"
        @click="ouvert = false"
      >
        Annuler
      </CzButton>
      <CzButton
        :chargement="envoi"
        libelle-chargement="Envoi…"
        :disabled="!message.trim()"
        @click="emit('envoyer', message.trim())"
      >
        Envoyer la relance
      </CzButton>
    </template>
  </CzModal>
</template>

<style scoped>
.relance {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  color: var(--text);
}

.relance__canaux {
  display: flex;
}

.relance__canaux [role="radio"] {
  cursor: default;
}

.relance__canaux .is-disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

.relance__canaux .is-on:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.relance__aide {
  margin: 0;
  font-size: 12.5px;
  color: var(--text-muted);
}
</style>
