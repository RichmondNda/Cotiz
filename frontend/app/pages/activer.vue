<!--
  Activation du compte (/activer?espace=plateforme|association|souscripteur&t=<téléphone>) : page sans maquette
  (lot 1.1, architecture/03 § Activation), sur le gabarit du mot de passe oublié. Identifiant + code d'activation remis
  par une personne (8 caractères, `K7M4-P9QX`) + nouveau mot de passe → compte actif et connecté directement.
  Le lien d'activation porte le téléphone (souscripteur), jamais le code. Espace par défaut : souscripteur.
-->
<script setup lang="ts">
import type { CodeErreurAuth, Role } from '~~/types'
import { nouveauMotDePasseValide } from '~/utils/mot-de-passe'
import { emailValide, telephoneValide } from '~/utils/validation'

definePageMeta({ layout: false })
useHead({ title: 'Activer mon compte — Cotiz', meta: [{ name: 'robots', content: 'noindex, nofollow' }] })

const route = useRoute()
const { activer } = useAuth()
const { connecter } = useSession()
const client = useClient()

const ESPACE: Record<string, Role> = { plateforme: 'superadmin', association: 'gestionnaire', souscripteur: 'souscripteur' }
const role: Role = ESPACE[String(route.query.espace)] ?? 'souscripteur'
const THEME = { souscripteur: 'member', gestionnaire: 'manager', superadmin: 'superadmin' } as const
const CONNEXION = { souscripteur: '/connexion', gestionnaire: '/connexion/association', superadmin: '/connexion/plateforme' } as const
const parTelephone = role === 'souscripteur'
const remetteur = role === 'souscripteur' ? 'votre association' : role === 'gestionnaire' ? 'l’équipe Cotiz' : 'l’exploitant Cotiz'

const identifiant = ref(typeof route.query.t === 'string' ? route.query.t : '')
const code = ref('')
const nouveau = ref('')
const confirmation = ref('')
const tentee = ref(false)
const envoi = ref(false)
const erreurApi = ref<CodeErreurAuth | 'reseau' | null>(null)

const erreurIdentifiant = computed(() => {
  if (!tentee.value) return undefined
  if (!identifiant.value.trim()) return parTelephone ? 'Indiquez votre numéro de téléphone' : 'Indiquez votre adresse email'
  if (parTelephone ? !telephoneValide(identifiant.value) && !/^\+\d{8,15}$/.test(identifiant.value.trim()) : !emailValide(identifiant.value)) {
    return parTelephone ? 'Numéro à 10 chiffres attendu' : 'Adresse email incomplète'
  }
  return undefined
})
const erreurCode = computed(() => {
  if (!tentee.value) return undefined
  return /^[2-9A-HJKMNP-Z]{4}-?[2-9A-HJKMNP-Z]{4}$/i.test(code.value.trim()) ? undefined : 'Code à 8 caractères attendu (ex. K7M4-P9QX)'
})

async function soumettre() {
  tentee.value = true
  if (erreurIdentifiant.value || erreurCode.value || !nouveauMotDePasseValide(nouveau.value, confirmation.value)) return
  envoi.value = true
  erreurApi.value = null
  try {
    await activer({ espace: role, identifiant: identifiant.value, code: code.value, motDePasse: nouveau.value })
    // Gestionnaire dont l'association n'est pas encore configurée : assistant de démarrage (mg-onboarding).
    const onboarding = role === 'gestionnaire' && await onboardingAFaire(client).catch(() => false)
    await connecter(role, onboarding ? '/asso/bienvenue' : undefined)
  }
  catch (e) {
    erreurApi.value = codeErreur<CodeErreurAuth>(e) ?? 'reseau'
  }
  finally {
    envoi.value = false
  }
}
</script>

<template>
  <NuxtLayout
    name="formulaire"
    :theme="THEME[role]"
    fond="espace"
    :retour="{ label: 'Retour à la connexion', to: CONNEXION[role] }"
  >
    <div class="activer">
      <form
        class="cz-card cz-card--lg activer__carte"
        novalidate
        @submit.prevent="soumettre"
      >
        <h1 class="activer__titre">
          Activer mon compte
        </h1>
        <p class="activer__texte">
          Saisissez le code d’activation remis par {{ remetteur }}, puis choisissez votre mot de passe.
        </p>
        <CzAlert
          v-if="erreurApi === 'code-incorrect' || erreurApi === 'identifiants-incorrects' || erreurApi === 'mot-de-passe-incorrect'"
          ton="danger"
        >
          <b>Identifiant ou code incorrect.</b> Vérifiez votre saisie et réessayez.
        </CzAlert>
        <CzAlert
          v-else-if="erreurApi === 'code-expire'"
          ton="warning"
          icone="en-attente"
        >
          <b>Ce code a expiré.</b> Demandez-en un nouveau à {{ remetteur }}.
        </CzAlert>
        <CzAlert
          v-else-if="erreurApi === 'blocage'"
          ton="danger"
          icone="en-attente"
        >
          <b>Trop d’essais : ce code est désactivé.</b> Demandez-en un nouveau à {{ remetteur }}.
        </CzAlert>
        <CzAlert
          v-else-if="erreurApi === 'deja-active'"
          ton="info"
        >
          <b>Ce compte est déjà activé.</b>
          <NuxtLink :to="CONNEXION[role]">Connectez-vous</NuxtLink>.
        </CzAlert>
        <CzAlert
          v-else-if="erreurApi === 'mot-de-passe-faible'"
          ton="danger"
        >
          <b>Mot de passe trop faible.</b> 10 caractères minimum, et pas un mot de passe courant.
        </CzAlert>
        <CzAlert
          v-else-if="erreurApi"
          ton="danger"
        >
          <b>L’activation a échoué.</b> Vérifiez votre connexion internet puis réessayez.
        </CzAlert>
        <CzField
          :label="parTelephone ? 'Téléphone' : 'Email'"
          :erreur="erreurIdentifiant"
        >
          <CzInput
            v-model="identifiant"
            :type="parTelephone ? 'telephone' : 'email'"
            :autocomplete="parTelephone ? 'tel-national' : 'username'"
            :inputmode="parTelephone ? 'numeric' : 'email'"
          />
        </CzField>
        <CzField
          label="Code d’activation"
          :erreur="erreurCode"
        >
          <CzInput
            v-model="code"
            autocomplete="one-time-code"
            placeholder="K7M4-P9QX"
          />
        </CzField>
        <NouveauMotDePasse
          v-model:mot-de-passe="nouveau"
          v-model:confirmation="confirmation"
          :tentee="tentee"
        />
        <CzButton
          type="submit"
          taille="lg"
          bloc
          :chargement="envoi"
          libelle-chargement="Activation…"
        >
          Activer mon compte
        </CzButton>
      </form>
    </div>
  </NuxtLayout>
</template>

<style scoped>
.activer {
  display: flex;
  justify-content: center;
  padding: var(--space-12) var(--space-4);
}

.activer__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 460px;
  max-width: 100%;
  padding: var(--space-8);
}

.activer__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 26px;
  font-weight: 600;
  color: var(--text-strong);
}

.activer__texte {
  margin: 0;
  font-size: 14.5px;
  line-height: 1.6;
  color: var(--text-muted);
}
</style>
