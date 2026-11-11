<!--
  Espace souscripteur (thème member, corail), mobile d'abord.
  Mobile : colonne unique, navigation basse 4 entrées, bouton flottant « Déclarer un paiement » au-dessus
  (masqué avec `definePageMeta({ fab: false })`). La navigation basse se masque avec `navBasse: false`
  ou, selon l'état de la page, `useGabaritSouscripteur().masquerNavBasse()`.
  Desktop : barre latérale 240 px, contenu centré sur 960 px (les pages resserrent leur colonne si besoin).
-->
<script setup lang="ts">
import { NAV_SOUSCRIPTEUR } from '~/config/navigation'

useHead({ bodyAttrs: { 'data-theme': 'member' } })
// Cloche en temps réel (nt.stream, lot 4.2).
useFluxNotifications()
useGardeAppareil()
const route = useRoute()
const { navMasquee } = useGabaritSouscripteur()
const avecNav = computed(() => route.meta.navBasse !== false && !navMasquee.value)
const avecFab = computed(() => avecNav.value && route.meta.fab !== false)
// « Projets » (liste des associations) reste actif sur le détail d'un projet et ses sous-pages ;
// « Mes contrats » s'ouvre depuis le profil.
const ALIAS = { projets: ['/projets'], profil: ['/contrats'] }
</script>

<template>
  <div
    class="gabarit-mb"
    data-theme="member"
  >
    <LienEvitement />
    <MemberSidebar
      :alias="ALIAS"
      class="gabarit-mb__side"
    />
    <main
      id="contenu"
      class="gabarit-mb__contenu"
      :class="{ 'avec-fab': avecFab, 'sans-nav': !avecNav }"
    >
      <div class="gabarit-mb__colonne">
        <slot />
      </div>
    </main>
    <div
      v-if="avecNav"
      class="gabarit-mb__bas"
    >
      <NuxtLink
        v-if="avecFab"
        to="/paiements/declarer"
        class="cz-fab gabarit-mb__fab"
      >
        <CzIcon nom="ajouter" />Déclarer un paiement
      </NuxtLink>
      <NavigationBasse
        :entrees="NAV_SOUSCRIPTEUR"
        :alias="ALIAS"
        class="gabarit-mb__nav"
      />
    </div>
  </div>
</template>

<style scoped>
.gabarit-mb {
  display: grid;
  grid-template-columns: var(--sidebar) minmax(0, 1fr);
  min-height: 100vh;
  background: var(--page);
}

.gabarit-mb__side {
  position: sticky;
  top: 0;
  height: 100vh;
}

.gabarit-mb__contenu {
  min-width: 0;
  padding: var(--space-8) var(--space-12);
}

.gabarit-mb__colonne {
  max-width: var(--member-max);
  margin: 0 auto;
}

.gabarit-mb__bas {
  display: none;
}

.gabarit-mb__fab {
  position: absolute;
  right: var(--space-4);
  bottom: calc(82px + env(safe-area-inset-bottom));
  color: var(--on-brand);
  text-decoration: none;
}

.gabarit-mb__fab:focus-visible {
  outline: none;
  box-shadow: var(--shadow-menu), var(--focus-ring);
}

.gabarit-mb__nav :deep(.nav-basse__pastille) {
  padding-inline: var(--space-4);
}

@media (max-width: 767px) {
  .gabarit-mb {
    grid-template-columns: minmax(0, 1fr);
  }

  .gabarit-mb__side {
    display: none;
  }

  .gabarit-mb__contenu {
    padding: var(--space-4) var(--space-3) calc(96px + env(safe-area-inset-bottom));
  }

  .gabarit-mb__contenu.avec-fab {
    padding-bottom: calc(150px + env(safe-area-inset-bottom));
  }

  .gabarit-mb__contenu.sans-nav {
    padding-bottom: var(--space-4);
  }

  .gabarit-mb__bas {
    display: block;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
  }
}
</style>
