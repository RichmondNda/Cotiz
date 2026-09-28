<!--
  Approbation d'une demande de création : récapitulatif (« L'association … sera créée avec le plan Essentiel.
  Mariam Ouattara recevra ses identifiants par email. ») et message personnalisé optionnel joint à l'email.
  Émet `approuver` avec le message éventuel ; `envoi` affiche le chargement du bouton.
-->
<script setup lang="ts">
const props = withDefaults(defineProps<{
  association: string
  plan: string
  responsable: string
  envoi?: boolean
}>(), { envoi: false })

const ouvert = defineModel<boolean>('ouvert', { default: false })
const emit = defineEmits<{ approuver: [message: string | undefined] }>()

const avecMessage = ref(false)
const message = ref('')
watch(ouvert, (o) => {
  if (!o) return
  avecMessage.value = false
  message.value = ''
})

const approuver = () => emit('approuver', avecMessage.value && message.value.trim() ? message.value.trim() : undefined)
</script>

<template>
  <CzModal
    v-model:ouvert="ouvert"
    :titre="`Approuver ${props.association} ?`"
  >
    <p class="approbation__texte">
      L’association {{ association }} sera créée avec le plan {{ plan }}. {{ responsable }} recevra ses identifiants par email.
    </p>
    <CzCheckbox
      v-model="avecMessage"
      class="approbation__case"
    >
      Joindre un message personnalisé
    </CzCheckbox>
    <CzField
      v-if="avecMessage"
      label="Message personnalisé"
      class="approbation__message"
    >
      <CzInput
        v-model="message"
        type="textarea"
        :lignes="3"
        :placeholder="`Ajouté à l’email envoyé à ${responsable}`"
      />
    </CzField>
    <template #pied>
      <CzButton
        variante="fantome"
        taille="sm"
        @click="ouvert = false"
      >
        Annuler
      </CzButton>
      <CzButton
        variante="succes"
        taille="sm"
        :chargement="envoi"
        libelle-chargement="Création…"
        @click="approuver"
      >
        Approuver et créer l’espace
      </CzButton>
    </template>
  </CzModal>
</template>

<style scoped>
.approbation__texte {
  margin: 0;
}

.approbation__case {
  margin-top: var(--space-3);
}

.approbation__message {
  margin-top: var(--space-3);
}
</style>
