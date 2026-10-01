<!--
  MgProfil — gérer son compte personnel de gestionnaire.
  Informations (prénom, nom, email de connexion, téléphone) ; mot de passe (fermé → formulaire → confirmation) ;
  « M'avertir quand… » (interrupteurs enregistrés immédiatement ; résumé quotidien par email en V2) ;
  raccourcis Paramètres / Équipe (desktop, le menu Plus les porte en mobile) ; déconnexion.
  Mot de passe actuel des mocks : `motdepasse`. Scénarios : `chargement`, `erreur`.
-->
<script setup lang="ts">
import type { PreferencesGestionnaire } from '~~/types'
import { codeErreur } from '~/composables/api/client'
import { estDate, formatDate } from '~/utils/format'

definePageMeta({ middleware: 'espace-gestionnaire', layout: 'backoffice', espace: 'gestionnaire', titre: 'Mon profil' })
useHead({ title: 'Mon profil · Cotiz' })

const toast = useToast()
const { deconnecter } = useSession()
const { data: profil, pending, error, refresh } = await useProfilGestionnaire()
const { refresh: rafraichirSession } = useMoi()
const actions = useActionsProfilGestionnaire()

const nomComplet = computed(() => (profil.value ? `${profil.value.prenom} ${profil.value.nom}`.trim() : ''))
const role = computed(() => (profil.value?.role === 'principal' ? 'Gestionnaire principale' : 'Gestionnaire secondaire'))

// ---------------------------------------------------------------- Informations
const infos = reactive({ prenom: '', nom: '', email: '', telephone: '' })
watch(profil, (p) => {
  if (!p) return
  Object.assign(infos, { prenom: p.prenom, nom: p.nom, email: p.email, telephone: p.telephone ?? '' })
}, { immediate: true })

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const tenteeInfos = ref(false)
const erreurEmailApi = ref<string>()
const erreursInfos = computed(() => ({
  prenom: tenteeInfos.value && !infos.prenom.trim() ? 'Indiquez votre prénom' : undefined,
  nom: tenteeInfos.value && !infos.nom.trim() ? 'Indiquez votre nom' : undefined,
  email: tenteeInfos.value && !EMAIL.test(infos.email.trim()) ? 'Indiquez un email valide, par exemple nom@exemple.com' : erreurEmailApi.value,
}))
watch(() => infos.email, () => (erreurEmailApi.value = undefined))

const envoiInfos = ref(false)
async function enregistrerInfos() {
  tenteeInfos.value = true
  if (erreursInfos.value.prenom || erreursInfos.value.nom || erreursInfos.value.email) return
  envoiInfos.value = true
  try {
    profil.value = await actions.modifier({
      prenom: infos.prenom.trim(),
      nom: infos.nom.trim(),
      email: infos.email.trim(),
      telephone: infos.telephone.trim(),
    })
    tenteeInfos.value = false
    toast.succes('Profil enregistré')
    await rafraichirSession()
  }
  catch (e) {
    if (codeErreur(e) === 'email-existant') erreurEmailApi.value = 'Cet email est déjà utilisé par un autre compte'
    else toast.erreur('Le profil n’a pas pu être enregistré', { message: 'Vérifiez votre connexion, puis réessayez.' })
  }
  finally {
    envoiInfos.value = false
  }
}

// ---------------------------------------------------------------- Mot de passe
const formMdp = ref(false)
const mdpModifie = ref(false)
const mdp = reactive({ actuel: '', nouveau: '', confirmation: '' })
const tenteeMdp = ref(false)
const erreurActuel = ref<string>()
const nouveauValide = (v: string) => v.length >= 8 && /\d/.test(v)
const erreursMdp = computed(() => ({
  actuel: tenteeMdp.value && !mdp.actuel ? 'Indiquez votre mot de passe actuel' : erreurActuel.value,
  nouveau: tenteeMdp.value && !nouveauValide(mdp.nouveau) ? 'Choisissez au moins 8 caractères, dont un chiffre' : undefined,
  confirmation: tenteeMdp.value && mdp.confirmation !== mdp.nouveau ? 'Les deux mots de passe ne correspondent pas' : undefined,
}))
watch(() => mdp.actuel, () => (erreurActuel.value = undefined))

function ouvrirMdp() {
  Object.assign(mdp, { actuel: '', nouveau: '', confirmation: '' })
  tenteeMdp.value = false
  erreurActuel.value = undefined
  mdpModifie.value = false
  formMdp.value = true
}

const envoiMdp = ref(false)
async function changerMdp() {
  tenteeMdp.value = true
  if (erreursMdp.value.actuel || erreursMdp.value.nouveau || erreursMdp.value.confirmation) return
  envoiMdp.value = true
  try {
    profil.value = await actions.changerMotDePasse(mdp.actuel, mdp.nouveau)
    formMdp.value = false
    mdpModifie.value = true
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

const derniereModif = computed(() => {
  const d = profil.value?.motDePasseModifieLe
  return d && estDate(d) ? formatDate(d) : d
})

// ---------------------------------------------------------------- Préférences
const PREFERENCES: { cle: keyof PreferencesGestionnaire, titre: string, detail: string, detailMobile: string, v2?: boolean }[] = [
  { cle: 'paiementDeclare', titre: 'Un souscripteur déclare un paiement', detail: 'Notification dans votre espace', detailMobile: 'Notification Cotiz' },
  { cle: 'contratSigne', titre: 'Un souscripteur signe un contrat', detail: 'Notification dans votre espace', detailMobile: 'Notification Cotiz' },
  { cle: 'resumeQuotidien', titre: 'Résumé quotidien par email', detail: 'Paiements à valider et nouveaux retards', detailMobile: 'Paiements à valider, nouveaux retards', v2: true },
]

async function basculer(cle: keyof PreferencesGestionnaire, valeur: boolean) {
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
  <div class="profil">
    <EnTeteGestionnaireMobile
      titre="Mon profil"
      retour="/asso/plus"
      :cloche="false"
    />
    <EnTetePage
      titre="Mon profil"
      sous-titre="Vos informations de gestionnaire et vos préférences"
      class="cz-desktop"
    />

    <CzErreurChargement
      v-if="error && !profil"
      titre="Impossible d’afficher votre profil"
      @reessayer="refresh()"
    />

    <div
      v-else-if="chargement"
      class="profil__grille"
      aria-busy="true"
    >
      <div class="cz-card cz-card--lg profil__carte">
        <CzSkeleton
          :hauteur="56"
          :largeur="56"
          forme="rond"
        />
        <CzSkeleton :hauteur="44" />
        <CzSkeleton :hauteur="44" />
      </div>
      <div class="cz-card cz-card--lg profil__carte">
        <CzSkeleton
          v-for="i in 3"
          :key="i"
          :hauteur="44"
        />
      </div>
    </div>

    <div
      v-else-if="profil"
      class="profil__grille"
    >
      <div class="profil__colonne">
        <!-- Identité (carte séparée en mobile) -->
        <div class="cz-card profil__identite cz-mobile">
          <CzAvatar
            :nom="nomComplet"
            taille="lg"
          />
          <div>
            <b class="profil__nom">{{ nomComplet }}</b>
            <CzBadge
              ton="brand"
              petit
            >
              {{ role }}
            </CzBadge>
          </div>
        </div>

        <!-- Informations -->
        <form
          class="cz-card cz-card--lg profil__carte"
          novalidate
          aria-labelledby="profil-infos"
          @submit.prevent="enregistrerInfos"
        >
          <div class="profil__identite cz-desktop">
            <CzAvatar
              :nom="nomComplet"
              taille="lg"
            />
            <div>
              <b class="profil__nom">{{ nomComplet }}</b>
              <CzBadge
                ton="brand"
                petit
              >
                {{ role }} · {{ profil.associationNom }}
              </CzBadge>
            </div>
          </div>
          <h2
            id="profil-infos"
            class="profil__titre profil__titre--mobile"
          >
            Mes informations
          </h2>
          <div class="profil__deux">
            <CzField
              label="Prénom"
              :erreur="erreursInfos.prenom"
            >
              <CzInput
                v-model="infos.prenom"
                autocomplete="given-name"
              />
            </CzField>
            <CzField
              label="Nom"
              :erreur="erreursInfos.nom"
            >
              <CzInput
                v-model="infos.nom"
                autocomplete="family-name"
              />
            </CzField>
          </div>
          <CzField
            label="Email de connexion"
            :erreur="erreursInfos.email"
          >
            <CzInput
              v-model="infos.email"
              type="email"
              autocomplete="email"
            />
          </CzField>
          <CzField label="Téléphone">
            <CzInput
              v-model="infos.telephone"
              type="tel"
              inputmode="tel"
              autocomplete="tel"
            />
          </CzField>
          <div class="profil__actions">
            <CzButton
              type="submit"
              :chargement="envoiInfos"
              libelle-chargement="Enregistrement…"
              class="profil__enregistrer"
            >
              Enregistrer
            </CzButton>
          </div>
        </form>

        <!-- Mot de passe -->
        <section
          class="cz-card cz-card--lg profil__carte"
          aria-labelledby="profil-mdp"
        >
          <div class="profil__ligne">
            <h2
              id="profil-mdp"
              class="profil__titre"
            >
              Mot de passe
            </h2>
            <CzButton
              v-if="!formMdp"
              variante="secondaire"
              taille="sm"
              @click="ouvrirMdp"
            >
              Modifier
            </CzButton>
          </div>

          <form
            v-if="formMdp"
            class="profil__mdp"
            novalidate
            @submit.prevent="changerMdp"
          >
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
              :aide="erreursMdp.nouveau ? undefined : '8 caractères minimum, dont un chiffre.'"
              :erreur="erreursMdp.nouveau"
            >
              <CzInput
                v-model="mdp.nouveau"
                type="password"
                autocomplete="new-password"
              />
            </CzField>
            <CzField
              label="Confirmer"
              :erreur="erreursMdp.confirmation"
            >
              <CzInput
                v-model="mdp.confirmation"
                type="password"
                autocomplete="new-password"
              />
            </CzField>
            <div class="profil__actions profil__actions--mdp">
              <CzButton
                variante="fantome"
                :disabled="envoiMdp"
                @click="formMdp = false"
              >
                Annuler
              </CzButton>
              <CzButton
                type="submit"
                :chargement="envoiMdp"
                libelle-chargement="Enregistrement…"
              >
                <span class="cz-desktop">Changer le mot de passe</span><span class="cz-mobile">Changer</span>
              </CzButton>
            </div>
          </form>
          <template v-else>
            <CzAlert
              v-if="mdpModifie"
              ton="success"
              sans-icone
              role="status"
            >
              <span class="cz-desktop">Mot de passe modifié. Utilisez-le dès votre prochaine connexion.</span>
              <span class="cz-mobile">Mot de passe modifié.</span>
            </CzAlert>
            <p class="profil__muted cz-desktop">
              Dernière modification : {{ derniereModif }}
            </p>
          </template>
        </section>
      </div>

      <div class="profil__colonne">
        <!-- Préférences -->
        <section
          class="profil__prefs"
          aria-labelledby="profil-prefs"
        >
          <h2
            id="profil-prefs"
            class="profil__titre profil__prefs-titre"
          >
            M’avertir quand…
          </h2>
          <ul class="profil__prefs-liste">
            <li
              v-for="p in PREFERENCES"
              :key="p.cle"
              class="profil__pref"
            >
              <span class="profil__pref-texte">
                <b>{{ p.titre }}</b>
                <span class="cz-desktop">{{ p.detail }}</span>
                <span class="cz-mobile">{{ p.detailMobile }}</span>
              </span>
              <CzSoon
                v-if="p.v2"
                petit
              >
                V2
              </CzSoon>
              <CzToggle
                :model-value="profil.preferences[p.cle]"
                :disabled="p.v2"
                :label="p.v2 ? `${p.titre} (disponible en V2)` : p.titre"
                @update:model-value="basculer(p.cle, $event)"
              />
            </li>
          </ul>
        </section>

        <!-- Raccourcis et déconnexion -->
        <section class="cz-card profil__raccourcis">
          <NuxtLink
            to="/asso/parametres"
            class="profil__raccourci cz-desktop"
          >
            Paramètres de l’association <span aria-hidden="true">→</span>
          </NuxtLink>
          <NuxtLink
            to="/asso/equipe"
            class="profil__raccourci cz-desktop"
          >
            Gérer l’équipe <span aria-hidden="true">→</span>
          </NuxtLink>
          <CzButton
            variante="danger-contour"
            bloc
            class="profil__deconnexion"
            @click="deconnecter()"
          >
            Se déconnecter
          </CzButton>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profil {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.profil__grille {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: start;
  max-width: 1080px;
}

.profil__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.profil__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.profil__identite {
  display: flex;
  align-items: center;
  gap: 14px;
}

.profil__nom {
  display: block;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.profil__titre {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.profil__titre--mobile {
  display: none;
}

.profil__ligne {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.profil__deux {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
}

.profil__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}

.profil__mdp {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.profil__muted {
  margin: 0;
  font-size: 13.5px;
  color: var(--text-muted);
}

.profil__prefs {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  padding: var(--space-6);
  border-radius: var(--r-card-lg);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.profil__prefs-titre {
  margin-bottom: var(--space-2);
}

.profil__prefs-liste {
  margin: 0;
  padding: 0;
  list-style: none;
}

.profil__pref {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-3) 0;
  border-bottom: 1px solid var(--divider);
}

.profil__pref-texte {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.profil__pref-texte b {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-strong);
}

.profil__pref-texte span {
  font-size: 12.5px;
  color: var(--text-muted);
}

.profil__raccourcis {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.profil__raccourci {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-muted);
  text-decoration: none;
}

.profil__raccourci:hover {
  color: var(--brand-dark);
}

@media (max-width: 1023px) {
  .profil__grille {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 767px) {
  .profil,
  .profil__colonne,
  .profil__grille {
    gap: var(--space-3);
  }

  .profil__carte {
    padding: var(--space-6);
  }

  .profil__titre {
    font-size: 16px;
  }

  .profil__titre--mobile {
    display: block;
  }

  .profil__nom {
    font-size: 17px;
  }

  .profil__identite > div {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
  }

  .profil__enregistrer,
  .profil__actions--mdp > * {
    flex: 1;
  }

  .profil__actions {
    justify-content: stretch;
  }

  /* Mobile : « M'avertir quand… » en titre de groupe au-dessus d'une liste. */
  .profil__prefs {
    padding: 0;
    background: transparent;
    box-shadow: none;
  }

  .profil__prefs-titre {
    margin: var(--space-2) 2px var(--space-1);
    font-size: 11.5px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--text-muted);
  }

  .profil__prefs-liste {
    overflow: hidden;
    border-radius: var(--r-md);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .profil__pref {
    padding: var(--space-2) 14px;
  }

  .profil__pref:last-child {
    border-bottom: 0;
  }

  .profil__raccourcis {
    padding: 0;
    background: transparent;
    box-shadow: none;
  }
}
</style>
