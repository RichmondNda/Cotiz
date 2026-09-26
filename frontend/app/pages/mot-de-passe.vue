<!--
  Mot de passe oublié (/mot-de-passe?profil=souscripteur|gestionnaire) : 4 étapes dans une carte.
  1. Profil (souscripteur → téléphone, gestionnaire → email) et « Recevoir un code ».
  2. Code à 6 chiffres (passage automatique), « Renvoyer le code » après 60 s ; erreurs : code incorrect, code expiré.
  3. Nouveau mot de passe + confirmation, robustesse sur 4 segments et règles cochées.
  4. Succès, retour à la connexion du profil.
  Thème et lien de retour suivent le profil choisi (corail souscripteur, violet gestionnaire).
  Codes mockés : server/mocks/IDENTIFIANTS.md.
-->
<script setup lang="ts">
import type { CodeErreurAuth, ProfilMotDePasse } from '~~/types'
import { nouveauMotDePasseValide } from '~/utils/mot-de-passe'
import { emailValide, telephoneValide } from '~/utils/validation'

// Gabarit posé dans le template : son thème dépend du profil choisi.
definePageMeta({ layout: false })
useHead({ title: 'Mot de passe oublié — Cotiz' })

const route = useRoute()
const { demanderCodeMotDePasse, verifierCodeMotDePasse, enregistrerMotDePasse } = useAuth()

const profil = ref<ProfilMotDePasse>(route.query.profil === 'gestionnaire' ? 'gestionnaire' : 'souscripteur')
const PROFILS = [
  { valeur: 'souscripteur' as const, label: 'Je suis souscripteur' },
  { valeur: 'gestionnaire' as const, label: 'Je suis gestionnaire' },
]
const theme = computed(() => (profil.value === 'souscripteur' ? 'member' : 'manager'))
const connexion = computed(() => (profil.value === 'souscripteur' ? '/connexion' : '/connexion/association'))

const etape = ref<1 | 2 | 3 | 4>(1)
const envoi = ref(false)
const erreurApi = ref<CodeErreurAuth | 'reseau' | null>(null)

// ---------------------------------------------------------------- Étape 1
const telephone = ref('')
const email = ref('')
const tentee1 = ref(false)
const destination = ref('')

const erreurIdentifiant = computed(() => {
  if (!tentee1.value) return undefined
  if (profil.value === 'souscripteur') {
    if (!telephone.value.trim()) return 'Indiquez votre numéro de téléphone'
    if (!telephoneValide(telephone.value)) return 'Numéro à 10 chiffres attendu'
  }
  else {
    if (!email.value.trim()) return 'Indiquez votre adresse email'
    if (!emailValide(email.value)) return 'Adresse email incomplète'
  }
  return undefined
})
watch(profil, () => {
  tentee1.value = false
  erreurApi.value = null
})

// Compte à rebours avant de pouvoir renvoyer le code.
const restant = ref(0)
let minuterie: ReturnType<typeof setInterval> | undefined
function demarrerCompteARebours(secondes: number) {
  clearInterval(minuterie)
  restant.value = secondes
  minuterie = setInterval(() => {
    restant.value = Math.max(0, restant.value - 1)
    if (!restant.value) clearInterval(minuterie)
  }, 1000)
}
onBeforeUnmount(() => clearInterval(minuterie))
const compteARebours = computed(() => `${Math.floor(restant.value / 60)}:${String(restant.value % 60).padStart(2, '0')}`)

async function envoyerCode() {
  envoi.value = true
  erreurApi.value = null
  try {
    const identifiant = profil.value === 'souscripteur' ? telephone.value : email.value.trim()
    const r = await demanderCodeMotDePasse(profil.value, identifiant)
    destination.value = r.destination
    code.value = ''
    demarrerCompteARebours(r.delaiRenvoi)
    return true
  }
  catch {
    erreurApi.value = 'reseau'
    return false
  }
  finally {
    envoi.value = false
  }
}

const saisieCode = ref<{ focaliser: () => void } | null>(null)
async function recevoirCode() {
  tentee1.value = true
  if (erreurIdentifiant.value) return
  if (await envoyerCode()) {
    etape.value = 2
    await nextTick()
    saisieCode.value?.focaliser()
  }
}

// ---------------------------------------------------------------- Étape 2
const code = ref('')
watch(code, () => {
  if (erreurApi.value === 'code-incorrect') erreurApi.value = null
})

async function verifier() {
  if (code.value.length < 6) {
    erreurApi.value = 'code-incorrect'
    return
  }
  envoi.value = true
  erreurApi.value = null
  try {
    await verifierCodeMotDePasse(code.value)
    etape.value = 3
  }
  catch (e) {
    const c = codeErreur<CodeErreurAuth>(e)
    erreurApi.value = c ?? 'reseau'
    if (c === 'code-expire') {
      code.value = ''
      restant.value = 0
      clearInterval(minuterie)
    }
  }
  finally {
    envoi.value = false
  }
}

async function renvoyer() {
  if (await envoyerCode()) saisieCode.value?.focaliser()
}

// ---------------------------------------------------------------- Étape 3
const nouveau = ref('')
const confirmation = ref('')
const tentee3 = ref(false)

async function enregistrer() {
  tentee3.value = true
  if (!nouveauMotDePasseValide(nouveau.value, confirmation.value)) return
  envoi.value = true
  erreurApi.value = null
  try {
    await enregistrerMotDePasse(nouveau.value)
    etape.value = 4
  }
  catch {
    erreurApi.value = 'reseau'
  }
  finally {
    envoi.value = false
  }
}
</script>

<template>
  <NuxtLayout
    name="formulaire"
    :theme="theme"
    fond="espace"
    :retour="{ label: 'Retour à la connexion', to: connexion }"
  >
    <div class="mdp">
      <div class="cz-card cz-card--lg mdp__carte">
        <div
          class="mdp__progression"
          role="progressbar"
          aria-label="Progression"
          :aria-valuenow="etape"
          aria-valuemin="1"
          aria-valuemax="4"
          :aria-valuetext="`Étape ${etape} sur 4`"
        >
          <span
            v-for="i in 4"
            :key="i"
            :class="{ 'is-on': i <= etape }"
          />
        </div>

        <!-- 1 · Demande -->
        <form
          v-if="etape === 1"
          class="mdp__etape"
          novalidate
          @submit.prevent="recevoirCode"
        >
          <h1 class="mdp__titre">
            Mot de passe oublié
          </h1>
          <p class="mdp__texte">
            Recevez un code pour choisir un nouveau mot de passe, sans passer par votre association.
          </p>
          <CzSegmented
            v-model="profil"
            :options="PROFILS"
            label="Profil"
            class="mdp__profil"
          />
          <CzAlert
            v-if="erreurApi"
            ton="danger"
          >
            <b>Le code n’a pas pu être envoyé.</b> Réessayez dans un instant.
          </CzAlert>
          <CzField
            v-if="profil === 'souscripteur'"
            label="Téléphone"
            aide="Le code vous sera envoyé par SMS."
            :erreur="erreurIdentifiant"
          >
            <CzInput
              v-model="telephone"
              type="telephone"
              class="mdp__champ"
              autocomplete="tel-national"
              inputmode="numeric"
            />
          </CzField>
          <CzField
            v-else
            label="Email"
            aide="Le code vous sera envoyé par email."
            :erreur="erreurIdentifiant"
          >
            <CzInput
              v-model="email"
              type="email"
              class="mdp__champ"
              autocomplete="email"
              inputmode="email"
            />
          </CzField>
          <CzButton
            type="submit"
            taille="lg"
            bloc
            :chargement="envoi"
            libelle-chargement="Envoi du code…"
          >
            Recevoir un code
          </CzButton>
        </form>

        <!-- 2 · Code -->
        <form
          v-else-if="etape === 2"
          class="mdp__etape"
          novalidate
          @submit.prevent="verifier"
        >
          <h1 class="mdp__titre">
            Saisissez le code
          </h1>
          <p class="mdp__texte">
            Code à 6 chiffres envoyé au <b>{{ destination }}</b>.
          </p>
          <CzAlert
            v-if="erreurApi === 'code-incorrect'"
            ton="danger"
          >
            <b>Code incorrect.</b> Vérifiez les chiffres et réessayez.
          </CzAlert>
          <CzAlert
            v-else-if="erreurApi === 'code-expire'"
            ton="warning"
            icone="en-attente"
          >
            <b>Ce code a expiré.</b> Demandez-en un nouveau.
          </CzAlert>
          <CzAlert
            v-else-if="erreurApi"
            ton="danger"
          >
            <b>La vérification a échoué.</b> Réessayez.
          </CzAlert>
          <CzCode
            ref="saisieCode"
            v-model="code"
            :erreur="erreurApi === 'code-incorrect'"
          />
          <span
            v-if="restant > 0"
            class="mdp__rebours"
            aria-live="off"
          >Renvoyer le code dans <b>{{ compteARebours }}</b></span>
          <CzButton
            v-else
            variante="fantome"
            class="mdp__renvoyer"
            :disabled="envoi"
            @click="renvoyer"
          >
            Renvoyer le code
          </CzButton>
          <CzButton
            type="submit"
            taille="lg"
            bloc
            :chargement="envoi"
            libelle-chargement="Vérification…"
          >
            Vérifier le code
          </CzButton>
        </form>

        <!-- 3 · Nouveau mot de passe -->
        <form
          v-else-if="etape === 3"
          class="mdp__etape"
          novalidate
          @submit.prevent="enregistrer"
        >
          <h1 class="mdp__titre">
            Nouveau mot de passe
          </h1>
          <CzAlert
            v-if="erreurApi"
            ton="danger"
          >
            <b>Le mot de passe n’a pas pu être enregistré.</b> Réessayez.
          </CzAlert>
          <NouveauMotDePasse
            v-model:mot-de-passe="nouveau"
            v-model:confirmation="confirmation"
            :tentee="tentee3"
            regles
          />
          <CzButton
            type="submit"
            taille="lg"
            bloc
            :chargement="envoi"
            libelle-chargement="Enregistrement…"
          >
            Enregistrer
          </CzButton>
        </form>

        <!-- 4 · Succès -->
        <div
          v-else
          class="mdp__etape mdp__succes"
          role="status"
        >
          <CzIconeSucces :taille="72" />
          <h1 class="mdp__titre">
            Mot de passe modifié
          </h1>
          <p class="mdp__texte">
            Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.
          </p>
          <CzButton
            taille="lg"
            bloc
            :to="connexion"
          >
            Aller à la connexion
          </CzButton>
        </div>
      </div>
    </div>
  </NuxtLayout>
</template>

<style scoped>
.mdp {
  display: flex;
  justify-content: center;
  padding: calc(var(--space-12) + var(--space-2)) var(--space-12);
}

.mdp__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  width: 460px;
  max-width: 100%;
  padding: var(--space-8);
}

.mdp__progression {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 6px;
}

.mdp__progression span {
  height: 6px;
  border-radius: var(--r-pill);
  background: var(--track);
  transition: background .2s;
}

.mdp__progression span.is-on {
  background: var(--brand);
}

.mdp__etape {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.mdp__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
  color: var(--text-strong);
}

.mdp__texte {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--text-muted);
}

.mdp__profil {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mdp__profil :deep([role="radio"]) {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  text-align: center;
}

.mdp__champ {
  height: var(--control-lg);
  font-size: 16px;
}

.mdp__texte b {
  white-space: nowrap;
}

.mdp__rebours {
  font-size: 13.5px;
  color: var(--text-muted);
}

.mdp__renvoyer {
  align-self: flex-start;
}

.mdp__succes {
  align-items: center;
  text-align: center;
}

@media (max-width: 767px) {
  .mdp {
    padding: var(--space-6) var(--space-4);
  }

  .mdp__carte {
    width: 100%;
    padding: var(--space-6) var(--space-4);
  }

  .mdp__profil :deep([role="radio"]) {
    min-height: 44px;
    padding: var(--space-2);
  }
}
</style>
