<!--
  MbProfil — gérer ses informations et ses préférences.
  Identité ; téléphone et email non modifiables (« Contactez votre association », email figé en V1 : ui-deviations) ;
  menu (Mes contrats avec le nombre à signer, Mes associations, Notifications avec les non lues) ;
  notifications sur cet appareil (push) et « Me prévenir quand… » par type, application / push (lot 4.2, ui-deviations) ;
  mot de passe, aide (revoir la présentation), déconnexion.
-->
<script setup lang="ts">
import type { ReglageNotification } from '~/composables/api/reglages-notifications'
import { formatTelephone, pluriel } from '~/utils/format'

definePageMeta({ middleware: 'espace-souscripteur', layout: 'souscripteur' })
useHead({ title: 'Profil · Cotiz' })

const { data: profil, pending, error, refresh } = useMonProfil()
const { data: contrats } = useContrats({ statut: 'a_signer' })
const { data: compteurs } = useCompteursNavigation()
const { deconnecter } = useSession()

const nom = computed(() => (profil.value ? `${profil.value.prenom} ${profil.value.nom}` : ''))
const aSigner = computed(() => contrats.value?.length ?? 0)
const nonLues = computed(() => compteurs.value?.notificationsNonLues ?? 0)

// ---------------------------------------------------------------- Réglages de notification (me.prefs, lot 4.2)
const { data: reglages, refresh: relireReglages } = useReglagesNotifications()
const enregistrerReglage = useActionReglageNotification()
const toast = useToast()

async function regler(r: ReglageNotification, canal: 'in_app' | 'push', valeur: boolean) {
  const avant = canal === 'in_app' ? r.inApp : r.push
  if (canal === 'in_app') r.inApp = valeur
  else r.push = valeur
  try {
    await enregistrerReglage(r.type, canal, valeur)
  }
  catch {
    if (canal === 'in_app') r.inApp = Boolean(avant)
    else r.push = avant
    toast.erreur('Préférence non enregistrée', { message: 'Vérifiez votre connexion, puis réessayez.' })
    await relireReglages()
  }
}
</script>

<template>
  <div class="profil">
    <EnTeteSouscripteur titre="Profil">
      <!-- Mobile : la déconnexion en haut de l'écran, pas seulement au bas du profil (retours du 2026-11-12). -->
      <template #actions-mobile>
        <CzButton
          variante="icone"
          icone="deconnexion"
          label="Se déconnecter"
          @click="deconnecter()"
        />
      </template>
    </EnTeteSouscripteur>

    <div class="profil__colonne">
      <template v-if="pending && !profil">
        <CzSkeleton
          :hauteur="104"
          class="profil__skel"
        />
        <CzSkeleton
          :hauteur="260"
          class="profil__skel"
        />
      </template>

      <CzEmpty
        v-else-if="error || !profil"
        icone="alerte"
        ton="danger"
        titre="Impossible d’afficher votre profil"
        description="Vérifiez votre connexion, puis réessayez."
        class="profil__vide"
      >
        <template #action>
          <CzButton
            variante="secondaire"
            @click="refresh()"
          >
            Réessayer
          </CzButton>
        </template>
      </CzEmpty>

      <template v-else>
        <CzCard
          variante="lg"
          tag="section"
          class="profil__identite"
          aria-label="Identité"
        >
          <CzAvatar
            :nom="nom"
            taille="lg"
          />
          <div>
            <h2>{{ nom }}</h2>
            <p>Souscripteur · {{ pluriel(profil.associationIds.length, 'association') }}</p>
          </div>
        </CzCard>

        <CzCard
          variante="lg"
          tag="section"
          class="profil__carte"
          aria-labelledby="titre-infos"
        >
          <h2 id="titre-infos">
            Mes informations
          </h2>
          <CzField
            label="Téléphone"
            aide="Numéro non modifiable. Contactez votre association pour le changer."
          >
            <div class="profil__telephone">
              <CzInput
                :model-value="formatTelephone(profil.telephone)"
                readonly
                class="profil__verrouille"
              />
              <CzIcon
                nom="cadenas"
                :taille="16"
                class="profil__cadenas"
              />
            </div>
          </CzField>
          <CzField
            label="Email (facultatif)"
            aide="Email non modifiable ici. Contactez votre association pour l’ajouter ou le changer."
          >
            <div class="profil__telephone">
              <CzInput
                :model-value="profil.email ?? ''"
                type="email"
                placeholder="Aucun email"
                readonly
                class="profil__verrouille"
              />
              <CzIcon
                nom="cadenas"
                :taille="16"
                class="profil__cadenas"
              />
            </div>
          </CzField>
        </CzCard>

        <nav
          class="profil__menu"
          aria-label="Mon espace"
        >
          <NuxtLink to="/contrats">
            <CzIcon nom="contrat" />
            <span>Mes contrats</span>
            <CzCount
              v-if="aSigner"
              :valeur="aSigner"
              ton="danger"
            />
            <CzIcon
              nom="chevron-droite"
              class="profil__chevron"
            />
          </NuxtLink>
          <NuxtLink to="/associations">
            <CzIcon nom="association" />
            <span>Mes associations</span>
            <CzIcon
              nom="chevron-droite"
              class="profil__chevron"
            />
          </NuxtLink>
          <NuxtLink to="/notifications">
            <CzIcon nom="notification" />
            <span>Notifications</span>
            <CzCount
              v-if="nonLues"
              :valeur="nonLues"
              ton="danger"
            />
            <CzIcon
              nom="chevron-droite"
              class="profil__chevron"
            />
          </NuxtLink>
        </nav>

        <NotificationsAppareil
          espace="subscriber"
          carte
        />

        <CzCard
          v-if="reglages"
          variante="lg"
          tag="section"
          class="profil__carte"
          aria-labelledby="titre-reglages"
        >
          <h2 id="titre-reglages">
            Me prévenir quand…
          </h2>
          <div
            class="profil__rappel profil__rappel--entete"
            aria-hidden="true"
          >
            <div />
            <span class="profil__canal">Application</span>
            <span
              v-if="reglages.pushPropose"
              class="profil__canal"
            >Push</span>
          </div>
          <div
            v-for="r in reglages.reglages"
            :key="r.type"
            class="profil__rappel"
          >
            <div>
              <b>{{ r.titre }}</b>
              <span v-if="r.obligatoire">Toujours affiché dans l’application</span>
            </div>
            <span class="profil__canal">
              <CzToggle
                :model-value="r.inApp"
                :disabled="r.obligatoire"
                :label="`${r.titre} : dans l’application`"
                @update:model-value="regler(r, 'in_app', $event)"
              />
            </span>
            <span
              v-if="reglages.pushPropose"
              class="profil__canal"
            >
              <CzToggle
                v-if="r.push !== null"
                :model-value="r.push"
                :label="`${r.titre} : notification push`"
                @update:model-value="regler(r, 'push', $event)"
              />
            </span>
          </div>
        </CzCard>

        <nav
          class="profil__menu"
          aria-label="Compte"
        >
          <NuxtLink :to="{ path: '/mot-de-passe', query: { profil: 'souscripteur' } }">
            <CzIcon
              nom="cadenas"
              class="profil__neutre"
            />
            <span>Changer mon mot de passe</span>
          </NuxtLink>
          <NuxtLink to="/bienvenue">
            <CzIcon
              nom="aide"
              class="profil__neutre"
            />
            <span>Aide · revoir la présentation</span>
          </NuxtLink>
          <button
            type="button"
            class="profil__deconnexion"
            @click="deconnecter()"
          >
            <CzIcon nom="deconnexion" />
            <span>Se déconnecter</span>
          </button>
        </nav>
      </template>
    </div>
  </div>
</template>

<style scoped>
.profil {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.profil :deep(.entete-mb__page),
.profil__colonne {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.profil__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.profil__skel {
  border-radius: var(--r-card-lg);
}

.profil__vide {
  padding: var(--space-12) var(--space-6);
  border-radius: var(--r-card-lg);
  box-shadow: var(--shadow);
}

.profil__identite {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-6);
}

.profil__identite h2,
.profil__carte h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 600;
  color: var(--text-strong);
}

.profil__identite p {
  margin: var(--space-1) 0 0;
  font-size: 13.5px;
  color: var(--text-muted);
}

.profil__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: var(--space-6);
}

.profil__telephone {
  position: relative;
}

.profil__verrouille {
  background: var(--disabled-field);
}

.profil__cadenas {
  position: absolute;
  top: 50%;
  right: var(--space-4);
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.profil__menu {
  display: flex;
  flex-direction: column;
  border-radius: var(--r-card-lg);
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.profil__menu > a,
.profil__menu > button {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 52px;
  padding: 0 var(--space-4);
  border: 0;
  background: transparent;
  font-family: var(--font-text);
  font-size: 14.5px;
  color: var(--text-strong);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.profil__menu > * + * {
  border-top: 1px solid var(--border);
}

.profil__menu > a:hover,
.profil__menu > button:hover {
  background: var(--surface-hover);
}

.profil__menu > a:focus-visible,
.profil__menu > button:focus-visible {
  outline: none;
  box-shadow: inset var(--focus-ring);
}

.profil__menu > a > .cz-icon:first-child {
  color: var(--brand);
}

.profil__menu span {
  flex: 1;
}

.profil__menu span + .cz-count {
  flex: none;
}

.profil__menu > a > .cz-icon.profil__neutre {
  color: var(--text-muted);
}

.profil__chevron {
  color: var(--text-muted);
}

.profil__menu .profil__deconnexion {
  font-weight: 600;
  color: var(--danger);
}

.profil__rappel {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.profil__rappel + .profil__rappel {
  padding-top: var(--space-3);
  border-top: 1px solid var(--divider-row);
}

.profil__rappel div {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font-size: 12.5px;
  color: var(--text-muted);
}

.profil__rappel--entete {
  font-size: 12px;
  color: var(--text-muted);
}

.profil__canal {
  display: flex;
  justify-content: center;
  width: 72px;
}

.profil__rappel b {
  font-size: 14.5px;
  font-weight: 400;
  color: var(--text-strong);
}

@media (max-width: 767px) {
  .profil,
  .profil__colonne {
    gap: var(--space-3);
  }
}
</style>
