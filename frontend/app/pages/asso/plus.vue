<!--
  MgPlus — menu « Plus » de la navigation basse (mobile uniquement) : profil, Suivi (Relances, Contrats,
  Notifications), Association (Équipe, Abonnement, Paramètres, revoir l'onboarding), déconnexion.
  En desktop (≥ 768 px), la barre latérale porte ces entrées : la page redirige vers le tableau de bord.
-->
<script setup lang="ts">
import { NAV_GESTIONNAIRE_PLUS } from '~/config/navigation'
import { BREAKPOINT_MOBILE } from '~/composables/useBreakpoint'

definePageMeta({
  middleware: [
    'espace-gestionnaire',
    () => {
      if (import.meta.client && window.innerWidth >= BREAKPOINT_MOBILE) return navigateTo('/asso', { replace: true })
    },
  ],
  layout: 'backoffice',
  espace: 'gestionnaire',
  titre: 'Plus',
})
useHead({ title: 'Plus · Cotiz' })

const { estMobile } = useBreakpoint()
const { deconnecter } = useSession()
const { data: moi } = useMoi()
const { data: profil } = useProfilGestionnaire()
const { compteur } = useEntreesNavigation()

// Passage en desktop (rotation, fenêtre élargie) : le menu n'a plus lieu d'être.
onMounted(() => {
  watch(estMobile, (mobile) => {
    if (!mobile) navigateTo('/asso', { replace: true })
  }, { immediate: true })
})

const nom = computed(() => (moi.value ? `${moi.value.prenom} ${moi.value.nom ?? ''}`.trim() : ''))
const role = computed(() => (profil.value?.role === 'secondaire' ? 'Gestionnaire secondaire' : 'Gestionnaire principale'))
</script>

<template>
  <div class="plus cz-mobile">
    <EnTeteGestionnaireMobile
      titre="Plus"
      :sous-titre="moi?.association?.nom"
    />

    <div
      v-if="!moi"
      class="cz-card plus__profil"
      aria-busy="true"
    >
      <CzSkeleton
        :hauteur="56"
        :largeur="56"
        forme="rond"
      />
      <span class="plus__qui">
        <CzSkeleton
          :hauteur="16"
          largeur="50%"
        />
        <CzSkeleton
          :hauteur="12"
          largeur="80%"
        />
      </span>
    </div>
    <NuxtLink
      v-else
      to="/asso/profil"
      class="cz-card plus__profil"
    >
      <CzAvatar
        :nom="nom"
        taille="lg"
      />
      <span class="plus__qui">
        <b>{{ nom }}</b>
        <span>{{ role }} · Voir mon profil</span>
      </span>
      <CzIcon
        nom="chevron-droite"
        class="plus__chevron"
      />
    </NuxtLink>

    <section
      v-for="groupe in NAV_GESTIONNAIRE_PLUS"
      :key="groupe.titre"
      class="plus__groupe"
      :aria-labelledby="`plus-${groupe.titre}`"
    >
      <h2
        :id="`plus-${groupe.titre}`"
        class="cz-notif-group plus__titre"
      >
        {{ groupe.titre }}
      </h2>
      <ul class="plus__liste">
        <li
          v-for="e in groupe.entrees"
          :key="e.cle"
        >
          <NuxtLink
            :to="e.to"
            class="plus__lien"
          >
            <CzIcon
              :nom="e.icone"
              class="plus__icone"
            />
            <span class="plus__label">{{ e.label }}</span>
            <CzCount
              v-if="compteur(e)"
              :valeur="compteur(e)!"
              :ton="e.tonCompteur ?? 'warning'"
            />
            <CzIcon
              nom="chevron-droite"
              class="plus__chevron"
            />
          </NuxtLink>
        </li>
      </ul>
    </section>

    <CzButton
      variante="danger-contour"
      bloc
      class="plus__deconnexion"
      @click="deconnecter()"
    >
      Se déconnecter
    </CzButton>
  </div>
</template>

<style scoped>
.plus {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.plus__profil {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  color: inherit;
  text-decoration: none;
}

.plus__qui {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.plus__qui b {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 600;
  color: var(--text-strong);
}

.plus__qui span {
  font-size: 12.5px;
  color: var(--text-muted);
}

.plus__groupe {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.plus__titre {
  margin: var(--space-1) 0 0;
}

.plus__liste {
  margin: 0;
  padding: 0;
  list-style: none;
  overflow: hidden;
  border-radius: var(--r-md);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.plus__liste li + li {
  border-top: 1px solid var(--divider-row);
}

.plus__lien {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-height: 56px;
  padding: var(--space-2) var(--space-4);
  font-size: 14.5px;
  color: var(--text);
  text-decoration: none;
}

.plus__lien:focus-visible,
.plus__profil:focus-visible {
  outline: none;
  box-shadow: var(--focus-ring);
}

.plus__icone {
  width: 20px;
  height: 20px;
  color: var(--brand-dark);
}

.plus__label {
  flex: 1;
  min-width: 0;
}

.plus__chevron {
  width: 16px;
  height: 16px;
  color: var(--text-muted);
}

.plus__deconnexion {
  margin-top: var(--space-1);
}
</style>
