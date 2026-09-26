<!--
  Connexion gestionnaire (/connexion/association) : email, mot de passe (afficher/masquer), « Rester connecté »,
  « Mot de passe oublié ? ». Erreurs : identifiants incorrects (bandeau rouge, champs conservés), espace suspendu
  (bandeau avec contact), blocage 15 min après 5 échecs. Chargement : bouton « Connexion… ».
  Succès → /asso (ou page demandée). Panneau : aperçu du tableau de bord. Identifiants : server/mocks/IDENTIFIANTS.md.
-->
<script setup lang="ts">
import type { CodeErreurAuth } from '~~/types'
import { formatFCFA, formatPourcent } from '~/utils/format'
import { emailValide } from '~/utils/validation'

// Gabarit posé dans le template : le panneau illustré est un slot du gabarit.
definePageMeta({ layout: false })
useHead({ title: 'Espace association — Cotiz' })

const { seConnecter } = useAuth()
const { connecter } = useSession()
const destination = useRedirectionConnexion()

// Aperçu du panneau : tableau de bord d'Entraide Yopougon (DONNEES-REFERENCE).
const APERCU = [
  { libelle: 'Collecté ce mois', valeur: formatFCFA(1_240_000) },
  { libelle: 'Paiements à valider', valeur: '6' },
  { libelle: 'Souscripteurs en retard', valeur: '14' },
  { libelle: 'Taux de recouvrement', valeur: formatPourcent(82) },
]

const email = ref('')
const motDePasse = ref('')
const resterConnecte = ref(true)
const envoi = ref(false)
const tentee = ref(false)
const erreurApi = ref<CodeErreurAuth | 'reseau' | null>(null)

const erreurEmail = computed(() => {
  if (!tentee.value) return undefined
  if (!email.value.trim()) return 'Indiquez votre adresse email'
  if (!emailValide(email.value)) return 'Adresse email incomplète'
  return undefined
})
const erreurMotDePasse = computed(() => (tentee.value && !motDePasse.value ? 'Indiquez votre mot de passe' : undefined))
const identifiantsFaux = computed(() => erreurApi.value === 'identifiants-incorrects')

async function soumettre() {
  tentee.value = true
  if (erreurEmail.value || erreurMotDePasse.value) return
  envoi.value = true
  erreurApi.value = null
  try {
    const resultat = await seConnecter({ espace: 'gestionnaire', identifiant: email.value.trim(), motDePasse: motDePasse.value })
    // Premier accès : configuration de l'espace (onboarding) avant le tableau de bord.
    await connecter('gestionnaire', resultat.etape === 'premiere-connexion' ? '/asso/bienvenue' : destination('gestionnaire'))
  }
  catch (e) {
    erreurApi.value = codeErreur<CodeErreurAuth>(e) ?? 'reseau'
    envoi.value = false
  }
}
</script>

<template>
  <NuxtLayout
    name="auth"
    theme="manager"
  >
    <template #panneau>
      <div class="asso-panneau">
        <b class="asso-panneau__accroche">Votre association, organisée.</b>
        <div
          class="asso-panneau__apercu"
          aria-hidden="true"
        >
          <div
            v-for="k in APERCU"
            :key="k.libelle"
            class="cz-kpi asso-panneau__kpi"
          >
            <div class="l">
              {{ k.libelle }}
            </div>
            <div class="v">
              {{ k.valeur }}
            </div>
          </div>
        </div>
      </div>
    </template>

    <form
      class="connexion"
      novalidate
      @submit.prevent="soumettre"
    >
      <div>
        <h1 class="connexion__titre">
          Espace association
        </h1>
        <p class="connexion__sous-titre">
          Connectez-vous pour gérer vos projets et vos souscripteurs.
        </p>
      </div>
      <CzAlert
        v-if="identifiantsFaux"
        ton="danger"
      >
        <b>Email ou mot de passe incorrect.</b> Vérifiez vos identifiants et réessayez.
      </CzAlert>
      <CzAlert
        v-else-if="erreurApi === 'compte-suspendu'"
        ton="danger"
        icone="rejete"
      >
        <b>L’espace de votre association est suspendu.</b> Contactez-nous pour le réactiver : [ADRESSE EMAIL DE CONTACT].
      </CzAlert>
      <CzAlert
        v-else-if="erreurApi === 'blocage'"
        ton="danger"
        icone="en-attente"
      >
        <b>Trop de tentatives.</b> Par sécurité, la connexion est bloquée pendant 15 minutes.
      </CzAlert>
      <CzAlert
        v-else-if="erreurApi"
        ton="danger"
      >
        <b>La connexion a échoué.</b> Vérifiez votre connexion internet puis réessayez.
      </CzAlert>
      <CzField
        label="Email"
        :erreur="erreurEmail"
      >
        <CzInput
          v-model="email"
          type="email"
          autocomplete="username"
          inputmode="email"
          :erreur="identifiantsFaux"
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
          :erreur="identifiantsFaux"
        />
      </CzField>
      <div class="connexion__ligne">
        <CzCheckbox v-model="resterConnecte">
          Rester connecté
        </CzCheckbox>
        <NuxtLink
          :to="{ path: '/mot-de-passe', query: { profil: 'gestionnaire' } }"
          class="connexion__lien cz-tap"
        >
          Mot de passe oublié ?
        </NuxtLink>
      </div>
      <CzButton
        type="submit"
        taille="lg"
        bloc
        :chargement="envoi"
        libelle-chargement="Connexion…"
      >
        Se connecter
      </CzButton>
      <div
        class="connexion__ou"
        role="separator"
      >
        ou
      </div>
      <p class="connexion__renvoi">
        Vous êtes souscripteur ? <NuxtLink
          to="/connexion"
          class="connexion__lien cz-tap"
        >
          Accéder à votre espace
        </NuxtLink>
      </p>
      <p class="connexion__renvoi">
        Pas encore inscrit ? <NuxtLink
          to="/demande"
          class="connexion__lien cz-tap"
        >
          Créer mon association
        </NuxtLink>
      </p>
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

.connexion__sous-titre {
  margin: var(--space-1) 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-muted);
}

.connexion__ligne {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  min-height: 44px;
}

.connexion__lien {
  font-size: 14px;
  font-weight: 600;
  color: var(--brand-dark);
  text-decoration: none;
}

.connexion__lien:hover {
  color: var(--ink-title);
}

.connexion__ou {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  font-size: 12px;
  color: var(--text-disabled);
}

.connexion__ou::before,
.connexion__ou::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--border);
}

.connexion__renvoi {
  margin: 0;
  font-size: 14px;
  color: var(--text);
}

/* ------------------------------------------------------------ Panneau */
.asso-panneau {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.asso-panneau__accroche {
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 600;
  line-height: 1.2;
}

.asso-panneau__apercu {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-3);
  width: 440px;
  max-width: 100%;
  padding: var(--space-4);
  border-radius: var(--r-card);
  background: var(--violet-page);
  box-shadow: var(--shadow-modal);
  color: var(--text);
}

.asso-panneau__kpi {
  padding: var(--space-3);
}

.asso-panneau__kpi .l {
  font-size: 11.5px;
}

.asso-panneau__kpi .v {
  font-size: 19px;
}

@media (max-width: 767px) {
  .connexion__renvoi {
    padding: var(--space-1) 0;
  }
}
</style>
