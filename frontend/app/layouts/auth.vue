<!--
  Écrans de connexion : écran scindé 50/50, panneau aux couleurs du profil à gauche (logo blanc, décor, slot `panneau`,
  slogan), formulaire centré sur 400 px à droite. Mobile : formulaire seul, logo au-dessus.
  Thème : prop `theme` (via <NuxtLayout name="auth" theme="…">) ou `definePageMeta({ theme })`.
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
    class="gabarit-auth"
    :data-theme="theme"
  >
    <aside class="gabarit-auth__panneau">
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
    <main class="gabarit-auth__formulaire">
      <div class="gabarit-auth__colonne">
        <NuxtLink
          to="/"
          class="gabarit-auth__logo-mobile"
          aria-label="Cotiz — accueil"
        >
          <CzLogo
            :taille="32"
            :taille-texte="20"
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
  grid-template-columns: 1fr 1fr;
  min-height: 100vh;
  background: var(--surface);
}

.gabarit-auth__panneau {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-8);
  padding: var(--space-12);
  overflow: hidden;
  background: var(--brand);
  color: var(--on-brand);
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
  padding: var(--space-8);
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
}
</style>
