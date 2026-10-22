<!--
  Connexion souscripteur (/connexion) : téléphone (+225) et mot de passe, gros bouton « Me connecter ».
  Erreurs : numéro inconnu, mot de passe incorrect. Mot de passe provisoire → étape « Bienvenue » (choix d'un
  nouveau mot de passe avec indicateur de robustesse) puis /bienvenue. Succès → /accueil (ou page demandée).
  Identifiants mockés : server/mocks/IDENTIFIANTS.md.
-->
<script setup lang="ts">
import type { CodeErreurAuth } from '~~/types'
import { telephoneValide } from '~/utils/validation'
import { nouveauMotDePasseValide } from '~/utils/mot-de-passe'

// Gabarit posé dans le template : le panneau illustré est un slot du gabarit.
definePageMeta({ layout: false })
useHead({ title: 'Mon espace — Cotiz' })

const { seConnecter, definirPremierMotDePasse } = useAuth()
const { connecter } = useSession()
const destination = useRedirectionConnexion()

const telephone = ref('')
const motDePasse = ref('')
const envoi = ref(false)
const tentee = ref(false)
const erreurApi = ref<CodeErreurAuth | 'reseau' | null>(null)
const prenom = ref<string | null>(null)

const erreurTelephone = computed(() => {
  if (!tentee.value) return undefined
  if (!telephone.value.trim()) return 'Indiquez votre numéro de téléphone'
  if (!telephoneValide(telephone.value)) return 'Numéro à 10 chiffres attendu'
  return undefined
})
const erreurMotDePasse = computed(() => (tentee.value && !motDePasse.value ? 'Indiquez votre mot de passe' : undefined))

watch([telephone, motDePasse], () => (erreurApi.value = null))

async function soumettre() {
  tentee.value = true
  if (erreurTelephone.value || erreurMotDePasse.value) return
  envoi.value = true
  erreurApi.value = null
  try {
    const r = await seConnecter({ espace: 'souscripteur', identifiant: telephone.value, motDePasse: motDePasse.value })
    if (r.etape === 'premiere-connexion') {
      prenom.value = r.prenom
      envoi.value = false
      return
    }
    await connecter('souscripteur', destination('souscripteur'))
  }
  catch (e) {
    erreurApi.value = codeErreur<CodeErreurAuth>(e) ?? 'reseau'
    envoi.value = false
  }
}

// ---------------------------------------------------------------- Première connexion
const nouveau = ref('')
const confirmation = ref('')
const tenteeNouveau = ref(false)

async function enregistrer() {
  tenteeNouveau.value = true
  if (!nouveauMotDePasseValide(nouveau.value, confirmation.value)) return
  envoi.value = true
  erreurApi.value = null
  try {
    await definirPremierMotDePasse(nouveau.value)
    await connecter('souscripteur', '/bienvenue')
  }
  catch {
    erreurApi.value = 'reseau'
    envoi.value = false
  }
}
</script>

<template>
  <NuxtLayout
    name="auth"
    theme="member"
  >
    <template #panneau>
      <b class="connexion__accroche">Suivez vos cotisations en toute simplicité</b>
    </template>
    <template v-if="prenom === null">
      <form
        class="connexion"
        novalidate
        @submit.prevent="soumettre"
      >
        <div>
          <h1 class="connexion__titre">
            Mon espace
          </h1>
          <p class="connexion__sous-titre">
            Connectez-vous avec votre numéro de téléphone.
          </p>
        </div>
        <CzAlert
          v-if="erreurApi === 'numero-inconnu'"
          ton="danger"
        >
          Ce numéro n’est rattaché à aucun compte. Contactez votre association.
        </CzAlert>
        <CzAlert
          v-else-if="erreurApi === 'mot-de-passe-incorrect'"
          ton="danger"
        >
          <b>Mot de passe incorrect.</b> Réessayez ou choisissez « Mot de passe oublié ».
        </CzAlert>
        <CzAlert
          v-else-if="erreurApi"
          ton="danger"
        >
          <b>La connexion a échoué.</b> Vérifiez votre connexion internet puis réessayez.
        </CzAlert>
        <CzField
          label="Téléphone"
          :erreur="erreurTelephone"
        >
          <CzInput
            v-model="telephone"
            type="telephone"
            class="connexion__champ"
            autocomplete="tel-national"
            inputmode="numeric"
            :erreur="erreurApi === 'numero-inconnu'"
          >
            <template #prefixe>
              <img
                src="/drapeau-ci.svg"
                alt=""
                width="20"
                height="14"
              >+225
            </template>
          </CzInput>
        </CzField>
        <CzField
          label="Mot de passe"
          :erreur="erreurMotDePasse"
        >
          <CzInput
            v-model="motDePasse"
            type="password"
            class="connexion__champ"
            autocomplete="current-password"
            :erreur="erreurApi === 'mot-de-passe-incorrect'"
          />
        </CzField>
        <CzButton
          type="submit"
          taille="lg"
          bloc
          :chargement="envoi"
          libelle-chargement="Connexion…"
        >
          Me connecter
        </CzButton>
        <NuxtLink
          :to="{ path: '/mot-de-passe', query: { profil: 'souscripteur' } }"
          class="connexion__oubli"
        >
          Mot de passe oublié ?
        </NuxtLink>
        <CzAlert ton="info">
          Vos identifiants vous ont été envoyés par votre association par SMS ou email.
        </CzAlert>
        <NuxtLink
          to="/connexion/association"
          class="connexion__autre"
        >
          Vous êtes gestionnaire d’une association ?
        </NuxtLink>
      </form>
    </template>

    <form
      v-else
      class="connexion"
      novalidate
      @submit.prevent="enregistrer"
    >
      <div>
        <h1 class="connexion__titre connexion__titre--bienvenue">
          {{ prenom ? `Bienvenue ${prenom} !` : 'Bienvenue !' }}
        </h1>
        <p class="connexion__sous-titre">
          Pour votre première connexion, choisissez votre propre mot de passe.
        </p>
      </div>
      <CzAlert
        v-if="erreurApi"
        ton="danger"
      >
        <b>Le mot de passe n’a pas pu être enregistré.</b> Réessayez.
      </CzAlert>
      <NouveauMotDePasse
        v-model:mot-de-passe="nouveau"
        v-model:confirmation="confirmation"
        :tentee="tenteeNouveau"
      />
      <CzButton
        type="submit"
        taille="lg"
        bloc
        :chargement="envoi"
        libelle-chargement="Enregistrement…"
      >
        Enregistrer et continuer
      </CzButton>
    </form>
  </NuxtLayout>
</template>

<style scoped>
.connexion {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.connexion__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  font-weight: 600;
  color: var(--text-strong);
}

.connexion__titre--bienvenue {
  font-size: 26px;
}

.connexion__sous-titre {
  margin: var(--space-1) 0 0;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

.connexion__champ {
  height: var(--control-lg);
  font-size: 16px;
}

.connexion__champ :deep(.pfx) {
  gap: 6px;
}

.connexion__oubli {
  padding: var(--space-2);
  font-size: 15px;
  font-weight: 600;
  color: var(--brand-dark);
  text-align: center;
  text-decoration: none;
}

.connexion__autre {
  font-size: 13px;
  color: var(--text-muted);
  text-align: center;
  text-decoration: none;
}

.connexion__oubli:hover,
.connexion__autre:hover {
  color: var(--ink-title);
}

.connexion__accroche {
  display: block;
  max-width: 420px;
  font-family: var(--font-display);
  font-size: 36px;
  font-weight: 600;
  line-height: 1.2;
}

@media (max-width: 767px) {
  .connexion__autre {
    padding: var(--space-3) 0;
  }
}
</style>
