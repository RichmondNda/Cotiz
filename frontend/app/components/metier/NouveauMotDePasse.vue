<!--
  Choix d'un nouveau mot de passe (première connexion souscripteur, mot de passe oublié) : champ, indicateur de
  robustesse (avec `regles` : liste des règles cochées), confirmation. Les messages d'erreur s'affichent après une
  tentative d'envoi (`tentee`) ; la page vérifie `nouveauMotDePasseValide()` avant d'appeler l'API.
-->
<script setup lang="ts">
import { motDePasseAcceptable } from '~/utils/mot-de-passe'

const props = withDefaults(defineProps<{
  tentee?: boolean
  regles?: boolean
}>(), { tentee: false, regles: false })

const motDePasse = defineModel<string>('motDePasse', { default: '' })
const confirmation = defineModel<string>('confirmation', { default: '' })

const erreurMotDePasse = computed(() => (props.tentee && !motDePasseAcceptable(motDePasse.value)
  ? 'Choisissez un mot de passe d’au moins 8 caractères, de robustesse « correcte » au minimum'
  : undefined))
const erreurConfirmation = computed(() => (props.tentee && confirmation.value !== motDePasse.value
  ? 'Les deux mots de passe ne correspondent pas'
  : undefined))
</script>

<template>
  <CzField
    label="Nouveau mot de passe"
    :erreur="erreurMotDePasse"
  >
    <CzInput
      v-model="motDePasse"
      type="password"
      class="nouveau-mdp__champ"
      autocomplete="new-password"
    />
  </CzField>
  <CzRobustesse
    :mot-de-passe="motDePasse"
    :regles="regles"
  />
  <CzField
    label="Confirmer le mot de passe"
    :erreur="erreurConfirmation"
  >
    <CzInput
      v-model="confirmation"
      type="password"
      class="nouveau-mdp__champ"
      autocomplete="new-password"
    />
  </CzField>
</template>

<style scoped>
.nouveau-mdp__champ {
  height: var(--control-lg);
  font-size: 16px;
}
</style>
