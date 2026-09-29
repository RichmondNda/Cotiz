<!--
  Refus d'une demande de création : motif obligatoire (liste), précisions libres et aperçu de l'email envoyé
  au responsable. Pour « Informations incomplètes », les précisions sont pré-remplies (maquette) tant qu'elles ne sont
  pas réécrites. Émet `refuser` ; `envoi` affiche le chargement du bouton.
-->
<script setup lang="ts">
import type { RefusDemande } from '~~/types'
import { MOTIFS_REFUS_DEMANDE } from '~/utils/statuts'

const props = withDefaults(defineProps<{
  association: string
  prenomResponsable: string
  envoi?: boolean
}>(), { envoi: false })

const ouvert = defineModel<boolean>('ouvert', { default: false })
const emit = defineEmits<{ refuser: [RefusDemande] }>()

const OPTIONS = MOTIFS_REFUS_DEMANDE.map(m => ({ valeur: m as string, label: m }))
const PRECISIONS: Record<string, string> = {
  'Informations incomplètes': 'Merci de compléter le numéro d’enregistrement et la description de l’activité.',
}

const motif = ref<string | null>(MOTIFS_REFUS_DEMANDE[0])
const precisions = ref('')
const erreur = ref('')

watch(ouvert, (o) => {
  if (!o) return
  motif.value = MOTIFS_REFUS_DEMANDE[0]
  precisions.value = PRECISIONS[MOTIFS_REFUS_DEMANDE[0]] ?? ''
  erreur.value = ''
})
watch(motif, (nouveau, ancien) => {
  if (precisions.value === (PRECISIONS[ancien ?? ''] ?? '')) precisions.value = PRECISIONS[nouveau ?? ''] ?? ''
  if (nouveau) erreur.value = ''
})

const apercu = computed(() => [
  `Bonjour ${props.prenomResponsable}, nous ne pouvons pas donner suite à votre demande pour le moment.`,
  motif.value && `Motif : ${motif.value.charAt(0).toLocaleLowerCase('fr')}${motif.value.slice(1)}.`,
  precisions.value.trim(),
].filter(Boolean).join(' '))

function refuser() {
  if (!motif.value) {
    erreur.value = 'Choisissez un motif de refus.'
    return
  }
  emit('refuser', { motif: motif.value, precisions: precisions.value.trim() || undefined })
}
</script>

<template>
  <CzModal
    v-model:ouvert="ouvert"
    :titre="`Refuser la demande de ${association} ?`"
    taille="md"
  >
    <div class="refus">
      <CzField
        label="Motif"
        requis
        :erreur="erreur || undefined"
      >
        <CzSelect
          v-model="motif"
          :options="OPTIONS"
        />
      </CzField>
      <CzField label="Précisions">
        <CzInput
          v-model="precisions"
          type="textarea"
          :lignes="3"
        />
      </CzField>
      <div
        class="refus__apercu"
        aria-live="polite"
      >
        <div class="refus__apercu-titre">
          Aperçu de l’email
        </div>
        {{ apercu }}
      </div>
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
        :chargement="envoi"
        libelle-chargement="Envoi…"
        @click="refuser"
      >
        Refuser la demande
      </CzButton>
    </template>
  </CzModal>
</template>

<style scoped>
.refus {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.refus__apercu {
  padding: var(--space-3);
  border: 1px solid var(--border);
  border-radius: var(--r-field);
  background: var(--surface-subtle);
  font-size: 13px;
  color: var(--text);
}

.refus__apercu-titre {
  margin-bottom: var(--space-1);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}
</style>
