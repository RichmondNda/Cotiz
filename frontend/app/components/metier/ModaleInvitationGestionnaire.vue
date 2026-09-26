<!--
  Invitation d'un gestionnaire secondaire (MgEquipe) : prénom, nom, email (reçoit les identifiants), téléphone.
  Le rôle est fixé à « Gestionnaire secondaire » (affiché en desktop, comme dans la maquette).
  Desktop : modale 520 px ; mobile : feuille basse (« Envoyer l'invitation » au-dessus de « Annuler »).
  Émet `inviter` avec le formulaire validé ; `erreur` : message renvoyé par l'API (email déjà utilisé…).
-->
<script setup lang="ts">
import type { InvitationGestionnaire } from '~~/types'

const props = withDefaults(defineProps<{
  envoi?: boolean
  erreur?: string
}>(), { envoi: false, erreur: undefined })

const ouvert = defineModel<boolean>('ouvert', { default: false })
const emit = defineEmits<{ inviter: [InvitationGestionnaire] }>()

const vierge = (): InvitationGestionnaire => ({ prenom: '', nom: '', email: '', telephone: '' })
const form = reactive(vierge())
const tentee = ref(false)
watch(ouvert, (v) => {
  if (!v) return
  Object.assign(form, vierge())
  tentee.value = false
})

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const erreurs = computed(() => ({
  prenom: tentee.value && !form.prenom.trim() ? 'Indiquez le prénom' : undefined,
  nom: tentee.value && !form.nom.trim() ? 'Indiquez le nom' : undefined,
  email: tentee.value && !EMAIL.test(form.email.trim()) ? 'Indiquez un email valide, par exemple nom@exemple.com' : props.erreur,
}))

function envoyer() {
  tentee.value = true
  if (!form.prenom.trim() || !form.nom.trim() || !EMAIL.test(form.email.trim())) return
  emit('inviter', {
    prenom: form.prenom.trim(),
    nom: form.nom.trim(),
    email: form.email.trim(),
    telephone: form.telephone?.trim() || undefined,
  })
}
</script>

<template>
  <CzModal
    v-model:ouvert="ouvert"
    titre="Inviter un gestionnaire"
    taille="md"
  >
    <form
      class="invitation"
      novalidate
      @submit.prevent="envoyer"
    >
      <div class="invitation__noms">
        <CzField
          label="Prénom"
          :erreur="erreurs.prenom"
          requis
        >
          <CzInput
            v-model="form.prenom"
            placeholder="Prénom"
            autocomplete="off"
          />
        </CzField>
        <CzField
          label="Nom"
          :erreur="erreurs.nom"
          requis
        >
          <CzInput
            v-model="form.nom"
            placeholder="Nom"
            autocomplete="off"
          />
        </CzField>
      </div>
      <CzField
        label="Email"
        :aide="erreurs.email ? undefined : 'Les identifiants de connexion seront envoyés à cette adresse.'"
        :erreur="erreurs.email"
        requis
        class="invitation__email"
      >
        <CzInput
          v-model="form.email"
          type="email"
          placeholder="nom@exemple.com"
          autocomplete="off"
        />
      </CzField>
      <CzField label="Téléphone">
        <CzInput
          v-model="form.telephone"
          type="tel"
          placeholder="+225"
          inputmode="tel"
        />
      </CzField>
      <div class="cz-field cz-desktop">
        <span
          id="invitation-role"
          class="cz-label"
        >Rôle</span>
        <div
          class="cz-seg invitation__role"
          role="radiogroup"
          aria-labelledby="invitation-role"
        >
          <span
            role="radio"
            aria-checked="true"
            class="is-on"
          >Gestionnaire secondaire</span>
        </div>
      </div>
      <button
        type="submit"
        hidden
      />
    </form>
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
        @click="envoyer"
      >
        Envoyer l’invitation
      </CzButton>
    </template>
  </CzModal>
</template>

<style scoped>
.invitation {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  color: var(--text);
}

.invitation__noms {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.invitation__role {
  display: flex;
}

.invitation__role span {
  cursor: default;
}
</style>
