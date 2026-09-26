<!--
  Rejet d'un paiement déclaré : motif obligatoire (preuve illisible, montant non reçu, montant différent, autre)
  et message au souscripteur.
  Desktop : modale « Rejeter le paiement de 75 000 F d'Awa Koné ? », motif en liste, message pré-rempli.
  Mobile : feuille basse « Rejeter ce paiement ? », motif en puces, message libre (« Précisez si besoin »).
  Émet `rejeter` avec le motif et le message ; `envoi` affiche le chargement du bouton.
-->
<script setup lang="ts">
import type { MotifRejet, RejetPaiement } from '~~/types'
import { formatFCFA } from '~/utils/format'

const props = withDefaults(defineProps<{
  montant: number
  prenom: string
  nom: string
  envoi?: boolean
}>(), { envoi: false })

const ouvert = defineModel<boolean>('ouvert', { default: false })
const emit = defineEmits<{ rejeter: [RejetPaiement] }>()

const { estMobile } = useBreakpoint()

const MOTIFS: { valeur: MotifRejet, label: string }[] = [
  { valeur: 'preuve_illisible', label: 'Preuve illisible' },
  { valeur: 'montant_non_recu', label: 'Montant non reçu' },
  { valeur: 'montant_different', label: 'Montant différent' },
  { valeur: 'autre', label: 'Autre' },
]
/** Puces de la feuille mobile (maquette : trois motifs). */
const MOTIFS_MOBILE = MOTIFS.filter(m => m.valeur !== 'montant_different')

const motif = ref<MotifRejet | null>('preuve_illisible')
const message = ref('')
const erreur = ref('')

/** Message proposé au gestionnaire en desktop (maquette) ; en mobile, le champ reste libre. */
const modele = computed(() => (motif.value === 'preuve_illisible'
  ? `Bonjour ${props.prenom}, la capture jointe est illisible. Merci de déclarer à nouveau votre paiement avec une photo nette du reçu.`
  : ''))

watch(ouvert, (o) => {
  if (!o) return
  motif.value = 'preuve_illisible'
  message.value = estMobile.value ? '' : modele.value
  erreur.value = ''
})
// Le message suit le motif tant que le gestionnaire ne l'a pas réécrit.
watch(modele, (nouveau, ancien) => {
  if (!estMobile.value && message.value === ancien) message.value = nouveau
})

function valider() {
  if (!motif.value) {
    erreur.value = 'Choisissez un motif de rejet.'
    return
  }
  emit('rejeter', { motif: motif.value, message: message.value.trim() || undefined })
}
</script>

<template>
  <CzSheet
    v-if="estMobile"
    v-model:ouvert="ouvert"
    titre="Rejeter ce paiement ?"
  >
    <div class="rejet">
      <fieldset class="rejet__motifs">
        <legend class="cz-label">
          Motif (envoyé à {{ prenom }} {{ nom }})
        </legend>
        <div class="rejet__puces">
          <CzChip
            v-for="m in MOTIFS_MOBILE"
            :key="m.valeur"
            :actif="motif === m.valeur"
            @click="motif = m.valeur"
          >
            {{ m.label }}
          </CzChip>
        </div>
      </fieldset>
      <CzField
        label="Message au souscripteur"
        libelle-masque
      >
        <CzInput
          v-model="message"
          type="textarea"
          placeholder="Précisez si besoin"
          :lignes="3"
        />
      </CzField>
    </div>
    <template #pied>
      <CzButton
        variante="fantome"
        @click="ouvert = false"
      >
        Annuler
      </CzButton>
      <CzButton
        variante="danger"
        :chargement="envoi"
        libelle-chargement="Rejet…"
        @click="valider"
      >
        Rejeter le paiement
      </CzButton>
    </template>
  </CzSheet>

  <CzModal
    v-else
    v-model:ouvert="ouvert"
    :titre="`Rejeter le paiement de ${formatFCFA(montant)} d’${prenom} ${nom} ?`"
    taille="md"
    sans-feuille
  >
    <div class="rejet">
      <CzField
        label="Motif"
        requis
        :erreur="erreur || undefined"
      >
        <CzSelect
          v-model="motif"
          :options="MOTIFS"
        />
      </CzField>
      <CzField label="Message au souscripteur">
        <CzInput
          v-model="message"
          type="textarea"
          :lignes="3"
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
        :chargement="envoi"
        libelle-chargement="Rejet…"
        @click="valider"
      >
        Rejeter le paiement
      </CzButton>
    </template>
  </CzModal>
</template>

<style scoped>
.rejet {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  color: var(--text);
}

.rejet__motifs {
  margin: 0;
  padding: 0;
  border: 0;
}

.rejet__puces {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
</style>
