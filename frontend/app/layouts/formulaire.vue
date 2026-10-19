<!--
  Parcours publics concentrés (demande de création, confirmation, mot de passe oublié) : en-tête simplifié
  (logo + lien de retour, sans menu), fond teinté de l'espace, contenu centré.
  Fond : corail pâle du site public (demande, confirmation), ou `fond="espace"` pour le fond de l'espace du thème
  (mot de passe oublié, qui suit le profil choisi).
  Thème et lien de retour : props (via <NuxtLayout name="formulaire" …>) ou `definePageMeta({ theme, retour })`.
-->
<script setup lang="ts">
const props = defineProps<{
  theme?: 'member' | 'manager' | 'superadmin'
  retour?: { label: string, to: string }
  fond?: 'public' | 'espace'
}>()

const route = useRoute()
const theme = computed(() => props.theme ?? route.meta.theme ?? 'manager')
const retour = computed(() => props.retour ?? route.meta.retour)
useHead({ bodyAttrs: { 'data-theme': theme } })
</script>

<template>
  <div
    class="gabarit-formulaire"
    :class="{ 'gabarit-formulaire--espace': fond === 'espace' }"
    :data-theme="theme"
  >
    <LienEvitement />
    <header class="gabarit-formulaire__entete">
      <NuxtLink
        to="/"
        class="gabarit-formulaire__logo"
        aria-label="Cotiz — accueil"
      >
        <CzLogo
          :taille="28"
          :taille-texte="19"
        />
      </NuxtLink>
      <NuxtLink
        v-if="retour"
        :to="retour.to"
        class="gabarit-formulaire__retour"
      >
        <CzIcon
          nom="chevron-gauche"
          :taille="16"
        />{{ retour.label }}
      </NuxtLink>
    </header>
    <main
      id="contenu"
      class="gabarit-formulaire__contenu"
    >
      <slot />
    </main>
  </div>
</template>

<style scoped>
.gabarit-formulaire {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--corail-page);
}

.gabarit-formulaire--espace {
  background: var(--page);
}

.gabarit-formulaire__entete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 72px;
  padding: 0 var(--space-12);
  background: var(--surface);
}

.gabarit-formulaire__logo {
  display: flex;
  text-decoration: none;
}

.gabarit-formulaire__retour {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  font-size: 14px;
  font-weight: 600;
  color: var(--brand-dark);
  text-decoration: none;
}

.gabarit-formulaire__retour:hover {
  color: var(--ink-title);
}

.gabarit-formulaire__contenu {
  flex: 1;
}

@media (max-width: 767px) {
  .gabarit-formulaire__entete {
    height: 64px;
    padding: 0 var(--space-4);
  }
}
</style>
