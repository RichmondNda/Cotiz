<!--
  Écrans de connexion. Thème : prop `theme` (via <NuxtLayout name="auth" theme="…">) ou `definePageMeta({ theme })`.
  - member / manager : écran scindé 50/50. Panneau à la couleur du profil (logo blanc, décor, slot `panneau`,
    slogan) et formulaire centré sur 400 px. Décor : disques pleins translucides (souscripteur), cercles en contour
    et point corail (gestionnaire).
    Mobile : formulaire seul, logo au-dessus — dans une carte sur le fond de l'espace, logo centré (souscripteur),
    ou à plat sur fond blanc, logo à gauche (gestionnaire).
  - superadmin : carte blanche de 420 px centrée sur le fond indigo pâle (logo + badge « Plateforme »).
-->
<script setup lang="ts">
const props = defineProps<{
  theme?: 'member' | 'manager' | 'superadmin'
}>()

const route = useRoute()
const theme = computed(() => props.theme ?? route.meta.theme ?? 'manager')
useHead({ bodyAttrs: { 'data-theme': theme } })
</script>

<template>
  <div
    v-if="theme === 'superadmin'"
    class="auth-plateforme"
    data-theme="superadmin"
  >
    <main
      id="contenu"
      class="auth-plateforme__carte"
    >
      <div class="auth-plateforme__entete">
        <CzLogo
          :taille="34"
          :taille-texte="20"
        />
        <span class="cz-badge cz-badge--brand auth-plateforme__badge"><CzIcon
          nom="plateforme"
          :taille="14"
        />Plateforme</span>
      </div>
      <slot />
    </main>
  </div>

  <div
    v-else
    class="gabarit-auth"
    :class="`gabarit-auth--${theme}`"
    :data-theme="theme"
  >
    <aside class="gabarit-auth__panneau">
      <template v-if="theme === 'member'">
        <span
          class="gabarit-auth__disque gabarit-auth__disque--bas"
          aria-hidden="true"
        />
        <span
          class="gabarit-auth__disque gabarit-auth__disque--haut"
          aria-hidden="true"
        />
      </template>
      <template v-else>
        <span
          class="gabarit-auth__cercle gabarit-auth__cercle--haut"
          aria-hidden="true"
        />
        <span
          class="gabarit-auth__cercle gabarit-auth__cercle--bas"
          aria-hidden="true"
        />
        <span
          class="gabarit-auth__point"
          aria-hidden="true"
        />
      </template>
      <NuxtLink
        to="/"
        class="gabarit-auth__logo"
        aria-label="Cotiz — accueil"
      >
        <CzLogo
          inverse
          :taille="34"
          :taille-texte="22"
        />
      </NuxtLink>
      <div class="gabarit-auth__milieu">
        <slot name="panneau" />
      </div>
      <span class="gabarit-auth__slogan">votre association organisée</span>
    </aside>
    <main
      id="contenu"
      class="gabarit-auth__formulaire"
    >
      <div class="gabarit-auth__colonne">
        <NuxtLink
          to="/"
          class="gabarit-auth__logo-mobile"
          aria-label="Cotiz — accueil"
        >
          <CzLogo
            :taille="theme === 'member' ? 36 : 32"
            :taille-texte="theme === 'member' ? 22 : 20"
          />
        </NuxtLink>
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.gabarit-auth {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  min-height: 100vh;
  background: var(--surface);
}

.gabarit-auth__panneau {
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-8);
  height: 100vh;
  padding: var(--space-12);
  overflow: hidden;
  background: var(--brand);
  color: var(--on-brand);
}

.gabarit-auth__disque {
  position: absolute;
  border-radius: 50%;
  background: color-mix(in srgb, var(--on-brand) 8%, transparent);
}

.gabarit-auth__disque--bas {
  width: 380px;
  height: 380px;
  right: -140px;
  bottom: -120px;
}

.gabarit-auth__disque--haut {
  width: 180px;
  height: 180px;
  left: 60px;
  top: 220px;
}

.gabarit-auth__cercle {
  position: absolute;
  border-radius: 50%;
  border: 2px solid color-mix(in srgb, var(--on-brand) 14%, transparent);
}

.gabarit-auth__cercle--haut {
  width: 360px;
  height: 360px;
  right: -120px;
  top: -100px;
}

.gabarit-auth__cercle--bas {
  width: 220px;
  height: 220px;
  left: -80px;
  bottom: 120px;
}

.gabarit-auth__point {
  position: absolute;
  width: 16px;
  height: 16px;
  right: 180px;
  top: 150px;
  border-radius: 50%;
  background: var(--corail);
}

.gabarit-auth__logo,
.gabarit-auth__milieu,
.gabarit-auth__slogan {
  position: relative;
}

.gabarit-auth__logo {
  display: flex;
  align-self: flex-start;
  text-decoration: none;
}

.gabarit-auth__slogan {
  font-size: 13px;
  opacity: .9;
}

.gabarit-auth__formulaire {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-12);
}

.gabarit-auth__colonne {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
  max-width: var(--auth-form);
}

.gabarit-auth__logo-mobile {
  display: none;
  text-decoration: none;
}

@media (max-width: 767px) {
  .gabarit-auth {
    grid-template-columns: 1fr;
  }

  .gabarit-auth__panneau {
    display: none;
  }

  .gabarit-auth__formulaire {
    align-items: flex-start;
    padding: var(--space-8) var(--space-6);
  }

  .gabarit-auth__logo-mobile {
    display: flex;
    margin-bottom: var(--space-2);
  }

  /* Souscripteur : carte blanche sur le fond de l'espace, logo centré. */
  .gabarit-auth--member {
    background: var(--page);
  }

  .gabarit-auth--member .gabarit-auth__formulaire {
    padding: var(--space-8) var(--space-4);
  }

  .gabarit-auth--member .gabarit-auth__colonne {
    max-width: none;
    padding: var(--space-6) var(--space-4);
    border-radius: var(--r-card-lg);
    background: var(--surface);
    box-shadow: var(--shadow);
  }

  .gabarit-auth--member .gabarit-auth__logo-mobile {
    justify-content: center;
  }
}

/* ------------------------------------------------------------ Plateforme */
.auth-plateforme {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: var(--space-12);
  background: var(--page);
}

.auth-plateforme__carte {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  width: 420px;
  max-width: 100%;
  padding: var(--space-8);
  border-radius: var(--r-card);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.auth-plateforme__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
}

.auth-plateforme__badge {
  gap: 6px;
}

@media (max-width: 767px) {
  .auth-plateforme {
    padding: var(--space-4);
  }

  .auth-plateforme__carte {
    width: 100%;
    padding: var(--space-6) var(--space-4);
  }
}
</style>
