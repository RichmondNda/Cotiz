<!--
  Back-office (gestionnaire : thème manager, violet ; super-admin : thème superadmin, indigo — déduit du chemin).
  Barre latérale 240 px (72 px repliée en tablette), barre supérieure 64 px, contenu limité à 1280 px sur fond `page`.
  Mobile (< 768 px) : gestionnaire → navigation basse 5 entrées, pas de barre supérieure (en-têtes de page mobiles) ;
  super-admin → barre supérieure avec menu tiroir.
-->
<script setup lang="ts">
import { NAV_GESTIONNAIRE_MOBILE } from '~/config/navigation'

const route = useRoute()
const espace = computed(() => route.meta.espace ?? (route.path.startsWith('/plateforme') ? 'superadmin' : 'gestionnaire'))
const theme = computed(() => (espace.value === 'superadmin' ? 'superadmin' : 'manager'))
useHead({ bodyAttrs: { 'data-theme': theme } })

const tiroir = ref(false)
watch(() => route.fullPath, () => (tiroir.value = false))
</script>

<template>
  <div
    class="gabarit-bo"
    :class="`gabarit-bo--${espace}`"
    :data-theme="theme"
  >
    <a
      href="#contenu"
      class="gabarit-bo__evitement"
    >Aller au contenu</a>
    <BackofficeSidebar
      :espace="espace"
      class="gabarit-bo__side gabarit-bo__side--large"
    />
    <BackofficeSidebar
      :espace="espace"
      replie
      class="gabarit-bo__side gabarit-bo__side--replie"
    />
    <div class="gabarit-bo__main">
      <BackofficeTopbar
        :espace="espace"
        class="gabarit-bo__top"
        @menu="tiroir = true"
      />
      <main
        id="contenu"
        class="gabarit-bo__contenu"
      >
        <slot />
      </main>
    </div>
    <NavigationBasse
      v-if="espace === 'gestionnaire'"
      :entrees="NAV_GESTIONNAIRE_MOBILE"
      class="gabarit-bo__nav-basse"
    />
    <CzOverlay
      v-if="espace === 'superadmin'"
      :ouvert="tiroir"
      position="gauche"
      @fermer="tiroir = false"
    >
      <BackofficeSidebar
        :espace="espace"
        class="gabarit-bo__tiroir"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        @naviguer="tiroir = false"
      />
    </CzOverlay>
  </div>
</template>

<style scoped>
.gabarit-bo {
  display: grid;
  grid-template-columns: var(--sidebar) minmax(0, 1fr);
  min-height: 100vh;
  background: var(--page);
}

.gabarit-bo__side {
  position: sticky;
  top: 0;
  height: 100vh;
}

.gabarit-bo__side--replie {
  display: none;
}

.gabarit-bo__main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.gabarit-bo__contenu {
  width: 100%;
  max-width: calc(var(--content-max) + 2 * var(--space-8));
  padding: var(--space-8);
}

.gabarit-bo__nav-basse {
  display: none;
}

.gabarit-bo__tiroir {
  width: var(--sidebar);
  max-width: 85vw;
  height: 100%;
}

.gabarit-bo__evitement {
  position: absolute;
  left: var(--space-2);
  top: -100px;
  z-index: 300;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--r-field);
  background: var(--surface);
  color: var(--brand-dark);
}

.gabarit-bo__evitement:focus {
  top: var(--space-2);
}

@media (max-width: 1023px) {
  .gabarit-bo {
    grid-template-columns: var(--sidebar-collapsed) minmax(0, 1fr);
  }

  .gabarit-bo__side--large {
    display: none;
  }

  .gabarit-bo__side--replie {
    display: flex;
  }

  .gabarit-bo__contenu {
    padding: var(--space-6);
  }
}

@media (max-width: 767px) {
  .gabarit-bo {
    grid-template-columns: minmax(0, 1fr);
  }

  .gabarit-bo__side--replie {
    display: none;
  }

  .gabarit-bo__contenu {
    padding: var(--space-4) var(--space-3);
  }

  /* Gestionnaire mobile : pas de barre supérieure, navigation basse fixe. */
  .gabarit-bo--gestionnaire .gabarit-bo__top {
    display: none;
  }

  .gabarit-bo--gestionnaire .gabarit-bo__contenu {
    padding-bottom: calc(96px + env(safe-area-inset-bottom));
  }

  .gabarit-bo--gestionnaire .gabarit-bo__nav-basse {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
  }
}
</style>
