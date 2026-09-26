<!--
  Modale de confirmation (420 px) : titre = question qui nomme l'objet, corps = conséquence, bouton = le verbe.
  Confirmation renforcée (`texteAConfirmer`) : taper le nom de l'objet active le bouton.
-->
<script setup lang="ts">
import type { VarianteBouton } from './CzButton.vue'

const props = withDefaults(defineProps<{
  titre: string
  /** Libellé du bouton de confirmation (verbe : « Retirer du projet »). */
  confirmer: string
  annuler?: string
  variante?: VarianteBouton
  chargement?: boolean
  libelleChargement?: string
  texteAConfirmer?: string
  labelSaisie?: string
}>(), {
  annuler: 'Annuler',
  variante: 'danger',
  chargement: false,
  libelleChargement: undefined,
  texteAConfirmer: undefined,
  labelSaisie: 'Nom à saisir pour confirmer',
})

const ouvert = defineModel<boolean>('ouvert', { default: false })
const emit = defineEmits<{ confirmer: [] }>()

const saisie = ref('')
const valide = computed(() => !props.texteAConfirmer || saisie.value.trim() === props.texteAConfirmer)
watch(ouvert, v => v && (saisie.value = ''))
</script>

<template>
  <CzModal
    v-model:ouvert="ouvert"
    :titre="titre"
    :fermable="!chargement"
  >
    <slot />
    <CzField
      v-if="texteAConfirmer"
      class="cz-confirmation__saisie"
    >
      <CzInput
        v-model="saisie"
        :label="labelSaisie"
        :placeholder="texteAConfirmer"
        autocomplete="off"
      />
    </CzField>
    <template #pied>
      <CzButton
        variante="fantome"
        taille="sm"
        :disabled="chargement"
        @click="ouvert = false"
      >
        {{ annuler }}
      </CzButton>
      <CzButton
        :variante="variante"
        taille="sm"
        :disabled="!valide"
        :chargement="chargement"
        :libelle-chargement="libelleChargement"
        @click="emit('confirmer')"
      >
        {{ confirmer }}
      </CzButton>
    </template>
  </CzModal>
</template>

<style scoped>
.cz-confirmation__saisie {
  margin-top: var(--space-3);
}
</style>
