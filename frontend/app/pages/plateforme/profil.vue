<!--
  SaProfil — gérer son compte d'administration.
  Informations personnelles (photo, prénom, nom ; email et rôle en lecture seule, email figé en V1 : ui-deviations) ; mot de passe (actuel, nouveau,
  confirmation) ; double authentification (V2) ; préférences de notification (interrupteurs enregistrés immédiatement).
  Mot de passe actuel des mocks : `motdepasse`. Scénarios : `chargement`, `erreur`.
-->
<script setup lang="ts">
import type { ProfilPlateforme } from '~~/types'
import { codeErreur } from '~/composables/api/client'
import { ROLES_PLATEFORME } from '~/utils/statuts'

definePageMeta({ middleware: 'espace-plateforme', layout: 'backoffice', espace: 'superadmin', titre: 'Mon profil' })
useHead({ title: 'Mon profil · Cotiz' })

type Preference = keyof ProfilPlateforme['preferences']

const toast = useToast()
const { data: profil, pending, error, refresh } = await useProfilPlateforme()
const { refresh: rafraichirSession } = useMoi()
const actions = useActionsProfilPlateforme()
const bientot = (message: string) => toast.info('Bientôt disponible', { message })

// ---------------------------------------------------------------- Informations
const infos = reactive({ prenom: '', nom: '', email: '' })
watch(profil, (p) => {
  if (p) Object.assign(infos, { prenom: p.prenom, nom: p.nom, email: p.email })
}, { immediate: true })
const tenteeInfos = ref(false)
const erreursInfos = computed(() => ({
  prenom: tenteeInfos.value && !infos.prenom.trim() ? 'Indiquez votre prénom' : undefined,
}))
const envoiInfos = ref(false)
async function enregistrerInfos() {
  tenteeInfos.value = true
  if (erreursInfos.value.prenom) return
  envoiInfos.value = true
  try {
    profil.value = await actions.modifier({ prenom: infos.prenom.trim(), nom: infos.nom.trim() })
    tenteeInfos.value = false
    toast.succes('Profil enregistré')
    await rafraichirSession()
  }
  catch {
    toast.erreur('Le profil n’a pas pu être enregistré', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoiInfos.value = false
  }
}

// ---------------------------------------------------------------- Mot de passe
const mdp = reactive({ actuel: '', nouveau: '', confirmation: '' })
const tenteeMdp = ref(false)
const erreurActuel = ref<string>()
watch(() => mdp.actuel, () => (erreurActuel.value = undefined))
const erreursMdp = computed(() => ({
  actuel: tenteeMdp.value && !mdp.actuel ? 'Indiquez votre mot de passe actuel' : erreurActuel.value,
  nouveau: tenteeMdp.value && !(mdp.nouveau.length >= 8 && /\d/.test(mdp.nouveau)) ? 'Au moins 8 caractères, dont un chiffre' : undefined,
  confirmation: tenteeMdp.value && mdp.confirmation !== mdp.nouveau ? 'Les deux mots de passe ne correspondent pas' : undefined,
}))
const envoiMdp = ref(false)
async function changerMdp() {
  tenteeMdp.value = true
  if (erreursMdp.value.actuel || erreursMdp.value.nouveau || erreursMdp.value.confirmation) return
  envoiMdp.value = true
  try {
    await actions.changerMotDePasse(mdp.actuel, mdp.nouveau)
    Object.assign(mdp, { actuel: '', nouveau: '', confirmation: '' })
    tenteeMdp.value = false
    toast.succes('Mot de passe mis à jour')
  }
  catch (e) {
    const code = codeErreur(e)
    if (code === 'mot-de-passe-incorrect') erreurActuel.value = 'Mot de passe actuel incorrect'
    else if (code === 'mot-de-passe-faible') toast.erreur('Mot de passe trop faible', { message: 'Choisissez au moins 8 caractères, dont un chiffre.' })
    else toast.erreur('Le mot de passe n’a pas pu être changé', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoiMdp.value = false
  }
}

// ---------------------------------------------------------------- Préférences
const PREFERENCES: { cle: Preference, libelle: string }[] = [
  { cle: 'nouvelleDemande', libelle: 'Nouvelle demande de création' },
  { cle: 'abonnementImpaye', libelle: 'Abonnement impayé' },
  { cle: 'nouvelleAssociation', libelle: 'Nouvelle association active' },
  { cle: 'resumeHebdomadaire', libelle: 'Résumé hebdomadaire par email' },
]
async function basculer(cle: Preference, valeur: boolean) {
  const p = profil.value
  if (!p) return
  const avant = p.preferences[cle]
  p.preferences[cle] = valeur
  try {
    await actions.modifier({ preferences: { ...p.preferences } })
  }
  catch {
    p.preferences[cle] = avant
    toast.erreur('Préférence non enregistrée', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
}

const chargement = computed(() => pending.value && !profil.value)
</script>

<template>
  <div class="sa-profil">
    <EnTetePage
      titre="Mon profil"
      sous-titre="Informations de votre compte d’administration."
    />

    <div
      v-if="chargement"
      class="cz-card sa-profil__carte"
    >
      <CzSkeleton :hauteur="240" />
    </div>
    <CzErreurChargement
      v-else-if="error || !profil"
      titre="Impossible d’afficher votre profil"
      @reessayer="refresh()"
    />

    <template v-else>
      <section class="cz-card sa-profil__carte">
        <h2 class="sa-profil__h2">
          Informations personnelles
        </h2>
        <div class="sa-profil__photo">
          <CzAvatar
            :nom="`${profil.prenom} ${profil.nom.startsWith('[') ? '' : profil.nom}`"
            taille="lg"
          />
          <CzButton
            variante="secondaire"
            taille="sm"
            @click="bientot('Le changement de photo arrive avec le back-end.')"
          >
            Changer la photo
          </CzButton>
        </div>
        <div class="sa-profil__deux">
          <CzField
            label="Prénom"
            :erreur="erreursInfos.prenom"
          >
            <CzInput
              v-model="infos.prenom"
              autocomplete="given-name"
            />
          </CzField>
          <CzField label="Nom">
            <CzInput
              v-model="infos.nom"
              autocomplete="family-name"
            />
          </CzField>
          <CzField
            label="Email"
            aide="Email non modifiable ici. Contactez un propriétaire de la plateforme pour le changer."
          >
            <CzInput
              :model-value="infos.email"
              type="email"
              disabled
            />
          </CzField>
          <CzField label="Rôle">
            <CzInput
              :model-value="ROLES_PLATEFORME[profil.role]"
              disabled
            />
          </CzField>
        </div>
        <div class="sa-profil__actions">
          <CzButton
            :chargement="envoiInfos"
            libelle-chargement="Enregistrement…"
            @click="enregistrerInfos"
          >
            Enregistrer
          </CzButton>
        </div>
      </section>

      <section class="cz-card sa-profil__carte">
        <h2 class="sa-profil__h2">
          Mot de passe
        </h2>
        <div class="sa-profil__trois">
          <CzField
            label="Mot de passe actuel"
            :erreur="erreursMdp.actuel"
          >
            <CzInput
              v-model="mdp.actuel"
              type="password"
              autocomplete="current-password"
            />
          </CzField>
          <CzField
            label="Nouveau mot de passe"
            :erreur="erreursMdp.nouveau"
          >
            <CzInput
              v-model="mdp.nouveau"
              type="password"
              autocomplete="new-password"
            />
          </CzField>
          <CzField
            label="Confirmation"
            :erreur="erreursMdp.confirmation"
          >
            <CzInput
              v-model="mdp.confirmation"
              type="password"
              autocomplete="new-password"
            />
          </CzField>
        </div>
        <div class="sa-profil__actions">
          <CzButton
            variante="secondaire"
            :chargement="envoiMdp"
            libelle-chargement="Mise à jour…"
            @click="changerMdp"
          >
            Mettre à jour le mot de passe
          </CzButton>
        </div>
      </section>

      <section class="cz-card sa-profil__carte sa-profil__ligne">
        <div>
          <h2 class="sa-profil__h2 sa-profil__h2--seul">
            Double authentification <CzSoon petit>
              V2
            </CzSoon>
          </h2>
          <p class="sa-profil__aide">
            Un code à 6 chiffres sera demandé à chaque connexion.
          </p>
        </div>
        <CzButton
          variante="secondaire"
          @click="bientot('La double authentification arrive en V2.')"
        >
          Activer
        </CzButton>
      </section>

      <section class="cz-card sa-profil__carte">
        <h2 class="sa-profil__h2">
          Préférences de notification
        </h2>
        <div class="sa-profil__prefs">
          <div
            v-for="p in PREFERENCES"
            :key="p.cle"
            class="sa-profil__pref"
          >
            <CzToggle
              :model-value="profil.preferences[p.cle]"
              :label="p.libelle"
              @update:model-value="v => basculer(p.cle, v)"
            />
            <span>{{ p.libelle }}</span>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.sa-profil {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  max-width: 756px;
}

.sa-profil__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.sa-profil__h2 {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin: 0;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  color: var(--text-strong);
}

.sa-profil__photo {
  display: flex;
  align-items: center;
  gap: var(--space-4);
}

.sa-profil__deux {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.sa-profil__trois {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.sa-profil__actions {
  display: flex;
  justify-content: flex-end;
}

.sa-profil__ligne {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.sa-profil__aide {
  margin: var(--space-2) 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

.sa-profil__prefs {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.sa-profil__pref {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 44px;
  font-size: 14px;
}

@media (max-width: 767px) {
  .sa-profil__deux,
  .sa-profil__trois {
    grid-template-columns: minmax(0, 1fr);
  }

  .sa-profil__ligne {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
