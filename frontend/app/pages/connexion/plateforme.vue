<!--
  Connexion plateforme (/connexion/plateforme, page non référencée) : carte centrée sur fond indigo pâle.
  Étape 1 : email + mot de passe (erreur : « Identifiants incorrects »). Étape 2 : code de vérification à 6 chiffres
  (ou code de secours), puis /plateforme. Double authentification obligatoire (lot 4.7) : sans second facteur, la
  session est restreinte et l'étape « Activer la double authentification » s'affiche (QR code dessiné dans le
  navigateur, premier code, codes de secours affichés une fois), puis /plateforme. Identifiants : server/mocks/IDENTIFIANTS.md.
-->
<script setup lang="ts">
import type { CodeErreurAuth } from '~~/types'

definePageMeta({ layout: 'auth', theme: 'superadmin' })
useHead({ title: 'Administration Cotiz', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const { seConnecter, verifierCodeConnexion, demarrerEnrolement, confirmerEnrolement, terminerEnrolement } = useAuth()
const { connecter } = useSession()
const destination = useRedirectionConnexion()

const etape = ref<'identifiants' | 'code' | 'enrolement' | 'secours'>('identifiants')
const email = ref('')
const motDePasse = ref('')
const code = ref('')
const envoi = ref(false)
const erreurApi = ref<CodeErreurAuth | 'reseau' | null>(null)
const tentee = ref(false)
const saisieCode = ref<{ focaliser: () => void } | null>(null)
/** Étape « code » : code de secours à la place du code à 6 chiffres. */
const parSecours = ref(false)
const codeSecours = ref('')
/** Enrôlement : secret (saisie manuelle), QR code de l'URL otpauth, codes de secours rendus à la confirmation. */
const enrolement = ref<{ secret: string, qr: string } | null>(null)
const codesSecours = ref<string[]>([])
const copies = ref(false)

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
    else if (r.etape === 'enrolement-2fa') {
      await commencerEnrolement()
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
  if (parSecours.value) {
    if (codeSecours.value.replace(/[\s-]/g, '').length < 10) {
      erreurApi.value = 'code-incorrect'
      return
    }
    return verifier(codeSecours.value, true)
  }
  if (code.value.length < 6) {
    erreurApi.value = 'code-incorrect'
    return
  }
  return verifier(code.value, false)
}

async function verifier(saisie: string, secours: boolean) {
  envoi.value = true
  erreurApi.value = null
  try {
    await verifierCodeConnexion(saisie, secours)
    await connecter('superadmin', destination('superadmin'))
  }
  catch (e) {
    erreurApi.value = codeErreur<CodeErreurAuth>(e) ?? 'reseau'
    envoi.value = false
  }
}

async function commencerEnrolement() {
  const { secret, otpauthUrl } = await demarrerEnrolement()
  const { toDataURL } = await import('qrcode')
  enrolement.value = { secret: secret.replace(/(.{4})/g, '$1 ').trim(), qr: await toDataURL(otpauthUrl, { margin: 1, width: 200, errorCorrectionLevel: 'M' }) }
  etape.value = 'enrolement'
  code.value = ''
  await nextTick()
  saisieCode.value?.focaliser()
}

async function confirmer() {
  if (code.value.length < 6) {
    erreurApi.value = 'code-incorrect'
    return
  }
  envoi.value = true
  erreurApi.value = null
  try {
    codesSecours.value = await confirmerEnrolement(code.value)
    etape.value = 'secours'
  }
  catch (e) {
    erreurApi.value = codeErreur<CodeErreurAuth>(e) ?? 'reseau'
  }
  finally {
    envoi.value = false
  }
}

async function copierCodes() {
  await navigator.clipboard.writeText(codesSecours.value.join('\n'))
  copies.value = true
}

async function continuer() {
  envoi.value = true
  erreurApi.value = null
  // Jeton renouvelé : la session n'est plus restreinte à l'enrôlement.
  if (await terminerEnrolement()) {
    await connecter('superadmin', destination('superadmin'))
    return
  }
  envoi.value = false
  erreurApi.value = 'reseau'
}

function basculerSecours() {
  parSecours.value = !parSecours.value
  erreurApi.value = null
  codeSecours.value = ''
  code.value = ''
}

function retour() {
  etape.value = 'identifiants'
  erreurApi.value = null
  parSecours.value = false
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
      v-else-if="etape === 'code'"
      class="plateforme"
      novalidate
      @submit.prevent="valider"
    >
      <div class="plateforme__entete-code">
        <h1 class="plateforme__titre plateforme__titre--code">
          Code de vérification
        </h1>
      </div>
      <p class="plateforme__texte">
        {{ parSecours
          ? 'Saisissez l’un de vos codes de secours. Chaque code ne sert qu’une fois.'
          : 'Saisissez le code à 6 chiffres envoyé sur votre application d’authentification.' }}
      </p>
      <CzAlert
        v-if="erreurApi === 'blocage'"
        ton="danger"
      >
        <b>Trop d’essais.</b> Patientez 15 minutes, puis reconnectez-vous.
      </CzAlert>
      <CzAlert
        v-else-if="erreurApi"
        ton="danger"
      >
        <b>Code incorrect.</b> Vérifiez les chiffres et réessayez.
      </CzAlert>
      <CzField
        v-if="parSecours"
        label="Code de secours"
      >
        <CzInput
          v-model="codeSecours"
          autocomplete="one-time-code"
          placeholder="ABCDE-FGHJK"
          :erreur="Boolean(erreurApi)"
        />
      </CzField>
      <CzCode
        v-else
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
        @click="basculerSecours"
      >
        {{ parSecours ? 'Utiliser le code de l’application' : 'Utiliser un code de secours' }}
      </CzButton>
      <CzButton
        variante="fantome"
        bloc
        @click="retour"
      >
        Retour
      </CzButton>
    </form>

    <form
      v-else-if="etape === 'enrolement' && enrolement"
      class="plateforme"
      novalidate
      @submit.prevent="confirmer"
    >
      <h1 class="plateforme__titre plateforme__titre--code">
        Activer la double authentification
      </h1>
      <p class="plateforme__texte">
        Obligatoire pour l’équipe Cotiz. Scannez ce QR code avec votre application d’authentification, puis saisissez
        le code à 6 chiffres qu’elle affiche.
      </p>
      <img
        :src="enrolement.qr"
        alt="QR code à scanner avec l’application d’authentification"
        class="plateforme__qr"
        width="200"
        height="200"
      >
      <p class="plateforme__texte">
        Pas de lecteur de QR code ? Saisissez cette clé : <code class="plateforme__cle">{{ enrolement.secret }}</code>
      </p>
      <CzAlert
        v-if="erreurApi === 'blocage'"
        ton="danger"
      >
        <b>Trop d’essais.</b> Patientez 15 minutes, puis réessayez.
      </CzAlert>
      <CzAlert
        v-else-if="erreurApi"
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
        Activer
      </CzButton>
    </form>

    <div
      v-else-if="etape === 'secours'"
      class="plateforme"
    >
      <h1 class="plateforme__titre plateforme__titre--code">
        Codes de secours
      </h1>
      <CzAlert ton="warning">
        <b>Notez ces codes maintenant.</b> Ils ne seront plus affichés. Chacun permet une connexion si vous n’avez
        plus votre téléphone.
      </CzAlert>
      <ul class="plateforme__secours">
        <li
          v-for="c in codesSecours"
          :key="c"
        >
          <code>{{ c }}</code>
        </li>
      </ul>
      <CzButton
        variante="secondaire"
        bloc
        icone="copier"
        @click="copierCodes"
      >
        {{ copies ? 'Codes copiés' : 'Copier les codes' }}
      </CzButton>
      <CzAlert
        v-if="erreurApi"
        ton="danger"
      >
        <b>La connexion a échoué.</b> Reconnectez-vous.
      </CzAlert>
      <CzButton
        bloc
        class="plateforme__bouton"
        :chargement="envoi"
        libelle-chargement="Connexion…"
        @click="continuer"
      >
        J’ai noté mes codes, continuer
      </CzButton>
    </div>

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

.plateforme__qr {
  align-self: center;
  border: 1px solid var(--border);
  border-radius: var(--r-field);
}

.plateforme__cle {
  font-family: var(--font-mono);
  color: var(--text-strong);
  word-break: break-all;
}

.plateforme__secours {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--space-2);
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--font-mono);
  font-size: 14px;
  color: var(--text-strong);
}

.plateforme__reserve {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
}
</style>
