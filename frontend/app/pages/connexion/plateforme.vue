<!--
  Connexion plateforme (/connexion/plateforme, page non référencée) : carte centrée sur fond indigo pâle.
  Étape 1 : email + mot de passe (erreur : « Identifiants incorrects »). Étape 2 (V2 dans la spec) : code de
  vérification à 6 chiffres, puis /plateforme. Identifiants : server/mocks/IDENTIFIANTS.md.
-->
<script setup lang="ts">
import type { CodeErreurAuth } from '~~/types'

definePageMeta({ layout: 'auth', theme: 'superadmin' })
useHead({ title: 'Administration Cotiz', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const { seConnecter, verifierCodeConnexion } = useAuth()
const { connecter } = useSession()
const destination = useRedirectionConnexion()

const etape = ref<'identifiants' | 'code'>('identifiants')
const email = ref('')
const motDePasse = ref('')
const code = ref('')
const envoi = ref(false)
const erreurApi = ref<CodeErreurAuth | 'reseau' | null>(null)
const tentee = ref(false)
const saisieCode = ref<{ focaliser: () => void } | null>(null)

const erreurEmail = computed(() => (tentee.value && !email.value.trim() ? 'Indiquez votre adresse email' : undefined))
const erreurMotDePasse = computed(() => (tentee.value && !motDePasse.value ? 'Indiquez votre mot de passe' : undefined))

async function soumettre() {
  tentee.value = true
  if (erreurEmail.value || erreurMotDePasse.value) return
  envoi.value = true
  erreurApi.value = null
  try {
    const r = await seConnecter({ espace: 'superadmin', identifiant: email.value.trim(), motDePasse: motDePasse.value })
    if (r.etape === 'code-requis') {
      etape.value = 'code'
      code.value = ''
      await nextTick()
      saisieCode.value?.focaliser()
    }
    else {
      await connecter('superadmin', destination('superadmin'))
    }
  }
  catch (e) {
    erreurApi.value = codeErreur<CodeErreurAuth>(e) ?? 'reseau'
  }
  finally {
    envoi.value = false
  }
}

async function valider() {
  if (code.value.length < 6) {
    erreurApi.value = 'code-incorrect'
    return
  }
  envoi.value = true
  erreurApi.value = null
  try {
    await verifierCodeConnexion(code.value)
    await connecter('superadmin', destination('superadmin'))
  }
  catch (e) {
    erreurApi.value = codeErreur<CodeErreurAuth>(e) ?? 'reseau'
    envoi.value = false
  }
}

function retour() {
  etape.value = 'identifiants'
  erreurApi.value = null
}
</script>

<template>
  <div class="plateforme-page">
    <form
      v-if="etape === 'identifiants'"
      class="plateforme"
      novalidate
      @submit.prevent="soumettre"
    >
      <h1 class="plateforme__titre">
        Administration Cotiz
      </h1>
      <CzAlert
        v-if="erreurApi === 'identifiants-incorrects'"
        ton="danger"
      >
        <b>Identifiants incorrects.</b> Réessayez.
      </CzAlert>
      <CzAlert
        v-else-if="erreurApi"
        ton="danger"
      >
        <b>La connexion a échoué.</b> Réessayez.
      </CzAlert>
      <CzField
        label="Email"
        :erreur="erreurEmail"
      >
        <CzInput
          v-model="email"
          type="email"
          autocomplete="username"
          :erreur="Boolean(erreurApi)"
        />
      </CzField>
      <CzField
        label="Mot de passe"
        :erreur="erreurMotDePasse"
      >
        <CzInput
          v-model="motDePasse"
          type="password"
          autocomplete="current-password"
          :erreur="Boolean(erreurApi)"
        />
      </CzField>
      <CzButton
        type="submit"
        bloc
        class="plateforme__bouton"
        :chargement="envoi"
        libelle-chargement="Connexion…"
      >
        Se connecter
      </CzButton>
    </form>

    <form
      v-else
      class="plateforme"
      novalidate
      @submit.prevent="valider"
    >
      <div class="plateforme__entete-code">
        <h1 class="plateforme__titre plateforme__titre--code">
          Code de vérification
        </h1>
        <CzSoon petit>
          V2
        </CzSoon>
      </div>
      <p class="plateforme__texte">
        Saisissez le code à 6 chiffres envoyé sur votre application d’authentification.
      </p>
      <CzAlert
        v-if="erreurApi"
        ton="danger"
      >
        <b>Code incorrect.</b> Vérifiez les chiffres et réessayez.
      </CzAlert>
      <CzCode
        ref="saisieCode"
        v-model="code"
        :erreur="Boolean(erreurApi)"
        class="plateforme__code"
        @complet="erreurApi = null"
      />
      <CzButton
        type="submit"
        bloc
        class="plateforme__bouton"
        :chargement="envoi"
        libelle-chargement="Vérification…"
      >
        Valider
      </CzButton>
      <CzButton
        variante="fantome"
        bloc
        @click="retour"
      >
        Retour
      </CzButton>
    </form>

    <p class="plateforme__reserve">
      Accès réservé à l’équipe Cotiz.
    </p>
  </div>
</template>

<style scoped>
.plateforme-page {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.plateforme {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.plateforme__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 600;
  color: var(--text-strong);
}

.plateforme__titre--code {
  font-size: 22px;
}

.plateforme__entete-code {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.plateforme__texte {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
}

.plateforme__code :deep(.cz-code__case) {
  height: 54px;
}

.plateforme__bouton {
  height: 46px;
}

.plateforme__reserve {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}
</style>
