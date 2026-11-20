<!--
  Invitation d'une personne au personnel de la plateforme (SaUtilisateurs, lot 4.7) : prénom, nom, email (son
  identifiant de connexion, sans compte Cotiz) et rôle. Aucun email envoyé (ui-deviations) : la page affiche ensuite
  le code d'invitation et son message prêt. Desktop : modale ; mobile : feuille basse.
  Émet `inviter` avec le formulaire validé ; `erreur` : message renvoyé par l'API (email déjà utilisé…).
-->
<script setup lang="ts">
import type { InvitationPersonnel, RolePlateforme } from '~~/types'
import { ROLES_PLATEFORME } from '~/utils/statuts'

const props = withDefaults(defineProps<{
  envoi?: boolean
  erreur?: string
}>(), { envoi: false, erreur: undefined })

const ouvert = defineModel<boolean>('ouvert', { default: false })
const emit = defineEmits<{ inviter: [InvitationPersonnel] }>()

const vierge = (): InvitationPersonnel => ({ prenom: '', nom: '', email: '', role: 'support' })
const form = reactive(vierge())
const tentee = ref(false)
watch(ouvert, (v) => {
  if (!v) return
  Object.assign(form, vierge())
  tentee.value = false
})

const ROLES: { valeur: RolePlateforme, label: string }[] = (['support', 'administrateur', 'proprietaire'] as const)
  .map(valeur => ({ valeur, label: ROLES_PLATEFORME[valeur] }))
const AIDE_ROLE: Record<RolePlateforme, string> = {
  support: 'Consulte les associations, sans rien modifier.',
  administrateur: 'Gère les associations, les demandes, les plans et la facturation ; lit le journal d’audit.',
  proprietaire: 'Tout, y compris l’équipe de la plateforme.',
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const erreurs = computed(() => ({
  prenom: tentee.value && !form.prenom.trim() ? 'Indiquez le prénom' : undefined,
  nom: tentee.value && !form.nom.trim() ? 'Indiquez le nom' : undefined,
  email: tentee.value && !EMAIL.test(form.email.trim()) ? 'Indiquez un email valide, par exemple nom@exemple.com' : props.erreur,
}))

function envoyer() {
  tentee.value = true
  if (!form.prenom.trim() || !form.nom.trim() || !EMAIL.test(form.email.trim())) return
  emit('inviter', { prenom: form.prenom.trim(), nom: form.nom.trim(), email: form.email.trim(), role: form.role })
}
</script>

<template>
  <CzModal
    v-model:ouvert="ouvert"
    titre="Inviter un membre"
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
        :aide="erreurs.email ? undefined : 'Son identifiant de connexion (adresse sans compte Cotiz). Vous lui transmettrez ensuite le code d’invitation.'"
        :erreur="erreurs.email"
        requis
      >
        <CzInput
          v-model="form.email"
          type="email"
          placeholder="nom@cotiz.app"
          autocomplete="off"
        />
      </CzField>
      <CzField
        label="Rôle"
        :aide="AIDE_ROLE[form.role]"
      >
        <CzSegmented
          v-model="form.role"
          :options="ROLES"
          label="Rôle"
          pleine-largeur
        />
      </CzField>
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
</style>
