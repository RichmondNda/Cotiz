<!--
  Suspension d'une association (confirmation renforcée) : motif obligatoire et saisie du nom de l'association.
  Le bouton reste inactif tant que le nom saisi ne correspond pas. Émet `suspendre` avec le motif et le nom saisi
  (le back le compare à son tour).
-->
<script setup lang="ts">
import { MOTIFS_SUSPENSION } from '~/utils/statuts'
import { pluriel } from '~/utils/format'

const props = withDefaults(defineProps<{
  association: string
  souscripteurs: number
  envoi?: boolean
}>(), { envoi: false })

const ouvert = defineModel<boolean>('ouvert', { default: false })
const emit = defineEmits<{ suspendre: [motif: string, nomSaisi: string] }>()

const OPTIONS = MOTIFS_SUSPENSION.map(m => ({ valeur: m as string, label: m }))
const motif = ref<string | null>(MOTIFS_SUSPENSION[0])
const saisie = ref('')
watch(ouvert, (o) => {
  if (!o) return
  motif.value = MOTIFS_SUSPENSION[0]
  saisie.value = ''
})
const confirme = computed(() => saisie.value.trim() === props.association && Boolean(motif.value))
</script>

<template>
  <CzModal
    v-model:ouvert="ouvert"
    :titre="`Suspendre ${association} ?`"
    taille="md"
  >
    <div class="suspension">
      <p class="suspension__texte">
        Les {{ pluriel(souscripteurs, 'souscripteur') }} et les gestionnaires perdront l’accès. Tapez le nom de l’association pour confirmer.
      </p>
      <CzField
        label="Motif"
        requis
      >
        <CzSelect
          v-model="motif"
          :options="OPTIONS"
        />
      </CzField>
      <CzField label="Nom de l’association">
        <CzInput
          v-model="saisie"
          :placeholder="association"
          autocomplete="off"
        />
      </CzField>
    </div>
    <template #pied>
      <CzButton
        variante="fantome"
        taille="sm"
        @click="ouvert = false"
      >
        Annuler
      </CzButton>
      <CzButton
        variante="danger"
        taille="sm"
        :disabled="!confirme"
        :chargement="envoi"
        libelle-chargement="Suspension…"
        @click="motif && emit('suspendre', motif, saisie.trim())"
      >
        Suspendre l’association
      </CzButton>
    </template>
  </CzModal>
</template>

<style scoped>
.suspension {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.suspension__texte {
  margin: 0;
}
</style>
